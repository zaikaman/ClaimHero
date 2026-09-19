import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConvexError } from "convex/values";
import * as users from "../convex/users";
import * as claims from "../convex/claims";
import * as appeals from "../convex/appeals";
import * as auth from "../convex/lib/auth";
import { assertStorageOwnership } from "../convex/lib/storageAuth";
import * as agentMailWebhook from "../convex/lib/agentMailWebhook";
import * as clinicalEvidences from "../convex/clinicalEvidences";
import * as emails from "../convex/emails";

describe("Security Audit Remediation (Items 9, 10, 12, 13, 14)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Item 9: Invite Theft via Email Squatting Defense", () => {
    it("createPasswordUser rejects email collision instead of returning existing ID", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ _id: "user_victim", email: "victim@hospital.org" }),
            }),
          }),
        },
      };

      await expect(
        (users.createPasswordUser as any)._handler(mockCtx, {
          provider: "password",
          providerAccountId: "acc_attacker_1",
          profile: { username: "victim@hospital.org" },
        })
      ).rejects.toThrow(ConvexError);
    });

    it("createGoogleUser rejects linking when providerAccountId does not match", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "user_victim",
                email: "victim@hospital.org",
                provider: "google",
                providerAccountId: "real_google_id_123",
              }),
            }),
          }),
        },
      };

      await expect(
        (users.createGoogleUser as any)._handler(mockCtx, {
          provider: "google",
          providerAccountId: "attacker_google_id_999",
          profile: {
            email: "victim@hospital.org",
            name: "Attacker Impersonator",
            emailVerified: true,
          },
        })
      ).rejects.toThrow(/already associated with another account/i);
    });

    it("createGoogleUser permits sign-in when providerAccountId matches existing user", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "user_victim",
                email: "victim@hospital.org",
                provider: "google",
                providerAccountId: "real_google_id_123",
              }),
            }),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const result = await (users.createGoogleUser as any)._handler(mockCtx, {
        provider: "google",
        providerAccountId: "real_google_id_123",
        profile: {
          email: "victim@hospital.org",
          name: "Real Victim",
          emailVerified: true,
        },
      });

      expect(result).toBe("user_victim");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("user_victim", expect.objectContaining({
        providerAccountId: "real_google_id_123",
      }));
    });
  });

  describe("Item 10: Anonymous User Full Experience (Judge & Evaluation Mode)", () => {
    it("requireNonAnonymousUser grants anonymous users the same rights as authenticated users", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({
            _id: "user_anon",
            isAnonymous: true,
            provider: "anonymous",
          }),
        },
      };

      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_anon" as any);

      const userId = await auth.requireNonAnonymousUser(mockCtx, "user_anon" as any);
      expect(userId).toBe("user_anon");
    });

    it("claims.create permits anonymous demo advocates to create claims", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "patient_1") {
              return Promise.resolve({
                _id: "patient_1",
                userId: "user_anon",
                name: "Test Patient",
                insurancePayer: "Molina Healthcare",
              });
            }
            if (id === "claim_anon_created") {
              return Promise.resolve({
                _id: "claim_anon_created",
                userId: "user_anon",
                claimNumber: "CLM-ANON-01",
              });
            }
            return Promise.resolve(null);
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
            filter: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
          insert: vi.fn().mockResolvedValue("claim_anon_created" as any),
        },
        scheduler: {
          runAfter: vi.fn().mockResolvedValue(undefined),
        },
      };

      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_anon" as any);

      const claimId = await (claims.create as any)._handler(mockCtx, {
        patientId: "patient_1",
        claimNumber: "CLM-ANON-01",
        serviceDate: "2026-01-01",
        providerName: "Clinic",
        deniedAmount: 500,
        patientOwedAmount: 500,
        cptCodes: ["99213"],
        icd10Codes: ["R05"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not necessary",
      });

      expect(claimId).toBe("claim_anon_created");
    });

    it("claims.generateUploadUrl permits anonymous demo advocates", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([]),
            }),
          }),
          system: {
            get: vi.fn().mockResolvedValue(null),
          },
        },
        storage: {
          generateUploadUrl: vi.fn().mockResolvedValue("https://storage.mock/upload"),
        },
      };

      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_anon" as any);

      const url = await (claims.generateUploadUrl as any)._handler(mockCtx, {});
      expect(url).toBe("https://storage.mock/upload");
    });
  });

  describe("Item 12: Webhook Freshness & Signature Verification", () => {
    it("verifySvixWebhook strictly rejects timestamps older than tolerance window (no 7-day replay)", async () => {
      const secret = "whsec_testsecret1234567890123456789012";
      const payload = JSON.stringify({ event: "message.received" });
      const id = "msg_replay_1";
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
      const signature = await agentMailWebhook.computeSvixSignature(id, expiredTimestamp, payload, secret);

      const result = await agentMailWebhook.verifySvixWebhook({
        payload,
        headers: {
          "svix-id": id,
          "svix-timestamp": expiredTimestamp,
          "svix-signature": `v1,${signature}`,
        },
        secret,
        toleranceInSeconds: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed tolerance");
    });
  });

  describe("Item 13: Storage IDOR Triad & Viewer Bearer URL Protection", () => {
    it("assertStorageOwnership rejects when storageId belongs to another user", async () => {
      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue({ _id: "st_foreign", size: 1024 }),
          },
          query: vi.fn().mockImplementation(() => ({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
            filter: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          })),
        },
      };

      await expect(
        assertStorageOwnership(mockCtx, "st_foreign" as any, "user_attacker" as any, "claim_victim" as any)
      ).rejects.toThrow(/Access denied to storage file/i);
    });

    it("assertStorageOwnership passes when storage file is owned via pendingUploads", async () => {
      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue({ _id: "st_legit", size: 1024 }),
          },
          patch: vi.fn().mockResolvedValue(undefined),
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "pendingUploads") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue({
                    storageId: "st_legit",
                    userId: "user_legit",
                  }),
                }),
              };
            }
            return {
              withIndex: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            };
          }),
        },
      };

      await expect(
        assertStorageOwnership(mockCtx, "st_legit" as any, "user_legit" as any)
      ).resolves.toBeUndefined();
    });

    it("updatePdfStorageId enforces storage ownership before updating appeal packet", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "appeal_1") {
              return Promise.resolve({
                _id: "appeal_1",
                claimId: "claim_1",
              });
            }
            return Promise.resolve(null);
          }),
          system: {
            get: vi.fn().mockResolvedValue({ _id: "st_idor_attempt", size: 5000 }),
          },
          patch: vi.fn().mockResolvedValue(undefined),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
            filter: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
        },
      };

      vi.spyOn(auth, "requireClaimEditor").mockResolvedValue({
        claim: { _id: "claim_1", userId: "user_owner" } as any,
        userId: "user_owner" as any,
        accessRole: "owner",
      });

      await expect(
        (appeals.updatePdfStorageId as any)._handler(mockCtx, {
          appealId: "appeal_1",
          pdfExportStorageId: "st_idor_attempt",
        })
      ).rejects.toThrow(/Access denied to storage file/i);
    });

    it("clinicalEvidences.listByClaim suppresses screenshotUrls for viewer role", async () => {
      const mockEvidences = [
        {
          _id: "ev_1",
          claimId: "claim_1",
          title: "Carelon Guideline",
          screenshotStorageId: "st_screenshot_1",
          screenshotUrl: "https://guidelines.carelon.com",
          relevanceScore: 90,
        },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(mockEvidences),
              }),
            }),
          }),
        },
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://signed.storage.convex.cloud/st_screenshot_1"),
        },
      };

      vi.spyOn(auth, "getClaimIfAuthorized").mockResolvedValue({
        claim: { _id: "claim_1", userId: "user_owner" } as any,
        userId: "user_viewer" as any,
        accessRole: "viewer",
      });

      const items = await (clinicalEvidences.listByClaim as any)._handler(mockCtx, {
        claimId: "claim_1",
      });

      expect(items).toHaveLength(1);
      // Screenshot download/signed URL must be stripped for viewer role
      expect(items[0].screenshotUrl).toBeUndefined();
      expect(mockCtx.storage.getUrl).not.toHaveBeenCalled();
    });

    it("emails.getThreadWithMessages suppresses attachment signed URLs for viewer role", async () => {
      const mockThread = {
        _id: "thread_1",
        claimId: "claim_1",
      };
      const mockMessages = [
        {
          _id: "msg_1",
          threadId: "thread_1",
          attachments: [
            {
              storageId: "st_attachment_1",
              filename: "Confidential-Medical-Records.pdf",
              contentType: "application/pdf",
              size: 20480,
            },
          ],
        },
      ];

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockThread),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                collect: vi.fn().mockResolvedValue(mockMessages),
              }),
            }),
          }),
        },
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://signed.storage.convex.cloud/st_attachment_1"),
        },
      };

      vi.spyOn(auth, "getClaimIfAuthorized").mockResolvedValue({
        claim: { _id: "claim_1", userId: "user_owner" } as any,
        userId: "user_viewer" as any,
        accessRole: "viewer",
      });

      const thread = await (emails.getThreadWithMessages as any)._handler(mockCtx, {
        threadId: "thread_1",
      });

      expect(thread).not.toBeNull();
      expect(thread.messages[0].attachments[0].url).toBeUndefined();
      expect(mockCtx.storage.getUrl).not.toHaveBeenCalled();
    });
  });

  describe("Item 14: Collaborator Grant Truncation & Shared-Case Access", () => {
    it("getClaimAccessRole finds collaborator grants positioned beyond index 20", async () => {
      // Build 25 collaborator grants; the target collaborator is at index 24
      const manyGrants: any[] = [];
      for (let i = 0; i < 24; i++) {
        manyGrants.push({
          _id: `grant_${i}`,
          claimId: "claim_shared",
          userId: `user_other_${i}`,
          email: `other_${i}@clinic.org`,
          role: "viewer",
          status: "active",
        });
      }
      manyGrants.push({
        _id: "grant_24",
        claimId: "claim_shared",
        userId: "user_target_collab",
        email: "target@clinic.org",
        role: "editor",
        status: "active",
      });

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({
            _id: "user_target_collab",
            email: "target@clinic.org",
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
              take: vi.fn().mockImplementation((limit: number) => {
                return Promise.resolve(manyGrants.slice(0, limit));
              }),
            }),
          }),
        },
      };

      const claim: any = {
        _id: "claim_shared",
        userId: "user_owner",
      };

      const role = await auth.getClaimAccessRole(mockCtx, claim, "user_target_collab" as any);
      expect(role).toBe("editor");
    });

    it("listComponentInboundMessages permits shared-case collaborators", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_shared") {
              return Promise.resolve({
                _id: "claim_shared",
                userId: "user_owner",
                agentMailThreadId: "thr_shared_123",
              });
            }
            if (id === "user_collaborator") {
              return Promise.resolve({
                _id: "user_collaborator",
                email: "collab@clinic.org",
              });
            }
            return Promise.resolve(null);
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "grant_1",
                claimId: "claim_shared",
                userId: "user_collaborator",
                role: "editor",
                status: "active",
              }),
              take: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
        runQuery: vi.fn().mockResolvedValue([
          { messageId: "msg_inbound_1", subject: "Review Decision" },
        ]),
      };

      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_collaborator" as any);

      const messages = await (emails.listComponentInboundMessages as any)._handler(mockCtx, {
        claimId: "claim_shared",
      });

      expect(messages).toHaveLength(1);
      expect(mockCtx.runQuery).toHaveBeenCalled();
    });

    it("getOutboundDeliveryStatus permits shared-case collaborators", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_shared") {
              return Promise.resolve({
                _id: "claim_shared",
                userId: "user_owner",
              });
            }
            if (id === "user_collaborator") {
              return Promise.resolve({
                _id: "user_collaborator",
                email: "collab@clinic.org",
              });
            }
            return Promise.resolve(null);
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "grant_1",
                claimId: "claim_shared",
                userId: "user_collaborator",
                role: "editor",
                status: "active",
              }),
              take: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
        runQuery: vi.fn().mockResolvedValue({
          status: "delivered",
          deliveredAt: Date.now(),
        }),
      };

      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_collaborator" as any);

      const status = await (emails.getOutboundDeliveryStatus as any)._handler(mockCtx, {
        outboundId: "out_123",
        claimId: "claim_shared",
      });

      expect(status).not.toBeNull();
      expect(status?.status).toBe("delivered");
      expect(mockCtx.runQuery).toHaveBeenCalled();
    });
  });
});