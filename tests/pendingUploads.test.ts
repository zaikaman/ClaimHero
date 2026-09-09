import { describe, it, expect, vi, beforeEach } from "vitest";
import * as claims from "../convex/claims";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("pendingUploads & Storage Ownership Verification (M1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerPendingUpload", () => {
    it("rejects when caller is unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = {};

      await expect(
        (claims.registerPendingUpload as any)._handler(mockCtx, {
          storageId: "storage_123" as any,
        })
      ).rejects.toThrow(/Unauthorized/i);
    });

    it("rejects when storage file does not exist in Convex storage", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);
      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue(null),
          },
        },
      };

      await expect(
        (claims.registerPendingUpload as any)._handler(mockCtx, {
          storageId: "storage_missing" as any,
        })
      ).rejects.toThrow(/Storage file not found/i);
    });

    it("successfully registers a fresh storage file to authenticated caller", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);
      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue({ _id: "storage_valid", size: 1024 }),
          },
          query: vi.fn(() => ({
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(null),
            })),
            filter: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(null),
            })),
          })),
          insert: vi.fn().mockResolvedValue("pending_upload_id_1"),
        },
      };

      const result = await (claims.registerPendingUpload as any)._handler(mockCtx, {
        storageId: "storage_valid" as any,
      });

      expect(result).toBe("pending_upload_id_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "pendingUploads",
        expect.objectContaining({
          userId: "user_1",
          storageId: "storage_valid",
          status: "pending",
        })
      );
    });

    it("returns existing record idempotently if registered by same user", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);
      const existingRecord = {
        _id: "pending_upload_existing",
        userId: "user_1",
        storageId: "storage_owned",
      };

      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue({ _id: "storage_owned", size: 1024 }),
          },
          query: vi.fn(() => ({
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(existingRecord),
            })),
          })),
        },
      };

      const result = await (claims.registerPendingUpload as any)._handler(mockCtx, {
        storageId: "storage_owned" as any,
      });

      expect(result).toBe("pending_upload_existing");
    });

    it("rejects registration if storage file is already registered to another user", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("attacker_user" as any);
      const existingRecord = {
        _id: "pending_victim",
        userId: "victim_user",
        storageId: "storage_victim",
      };

      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue({ _id: "storage_victim", size: 1024 }),
          },
          query: vi.fn(() => ({
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(existingRecord),
            })),
          })),
        },
      };

      await expect(
        (claims.registerPendingUpload as any)._handler(mockCtx, {
          storageId: "storage_victim" as any,
        })
      ).rejects.toThrow(/Forbidden: This storage file belongs to another user/i);
    });

    it("rejects registration if storage file is already linked to another user's claim", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("attacker_user" as any);
      const existingClaim = {
        _id: "claim_victim",
        userId: "victim_user",
        denialLetterStorageId: "storage_claim_victim",
      };

      const mockCtx: any = {
        db: {
          system: {
            get: vi.fn().mockResolvedValue({ _id: "storage_claim_victim", size: 1024 }),
          },
          query: vi.fn((table: string) => {
            if (table === "pendingUploads") {
              return {
                withIndex: vi.fn(() => ({
                  first: vi.fn().mockResolvedValue(null),
                })),
              };
            }
            return {
              filter: vi.fn(() => ({
                first: vi.fn().mockResolvedValue(existingClaim),
              })),
            };
          }),
        },
      };

      await expect(
        (claims.registerPendingUpload as any)._handler(mockCtx, {
          storageId: "storage_claim_victim" as any,
        })
      ).rejects.toThrow(/Forbidden: This storage file is already linked to another user's claim/i);
    });
  });

  describe("verifyStorageOwnershipInternal", () => {
    it("verifies ownership from pendingUploads and updates status to processing", async () => {
      const mockPending = {
        _id: "p1",
        userId: "user_owner",
        storageId: "storage_1",
        status: "pending",
      };

      const mockCtx: any = {
        db: {
          query: vi.fn(() => ({
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(mockPending),
            })),
          })),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const result = await (claims.verifyStorageOwnershipInternal as any)._handler(mockCtx, {
        storageId: "storage_1" as any,
        userId: "user_owner" as any,
      });

      expect(result.authorized).toBe(true);
      expect(result.source).toBe("pendingUploads");
      expect(mockCtx.db.patch).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ status: "processing" })
      );
    });

    it("rejects when pendingUpload belongs to another user", async () => {
      const mockPending = {
        _id: "p1",
        userId: "victim_user",
        storageId: "storage_1",
        status: "pending",
      };

      const mockCtx: any = {
        db: {
          query: vi.fn(() => ({
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(mockPending),
            })),
          })),
        },
      };

      await expect(
        (claims.verifyStorageOwnershipInternal as any)._handler(mockCtx, {
          storageId: "storage_1" as any,
          userId: "attacker_user" as any,
        })
      ).rejects.toThrow(/Forbidden: You do not have permission to access or parse this storage file/i);
    });

    it("verifies ownership from existing claims", async () => {
      const mockClaim = {
        _id: "c1",
        userId: "user_owner",
        denialLetterStorageId: "storage_claim_file",
      };

      const mockCtx: any = {
        db: {
          query: vi.fn((table: string) => {
            if (table === "pendingUploads") {
              return {
                withIndex: vi.fn(() => ({
                  first: vi.fn().mockResolvedValue(null),
                })),
              };
            }
            return {
              filter: vi.fn(() => ({
                first: vi.fn().mockResolvedValue(mockClaim),
              })),
            };
          }),
        },
      };

      const result = await (claims.verifyStorageOwnershipInternal as any)._handler(mockCtx, {
        storageId: "storage_claim_file" as any,
        userId: "user_owner" as any,
      });

      expect(result.authorized).toBe(true);
      expect(result.source).toBe("claims");
    });

    it("rejects when storageId is completely unassociated with caller", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn(() => ({
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(null),
            })),
            filter: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(null),
            })),
          })),
        },
      };

      await expect(
        (claims.verifyStorageOwnershipInternal as any)._handler(mockCtx, {
          storageId: "storage_random" as any,
          userId: "user_1" as any,
        })
      ).rejects.toThrow(/File is not registered to your account/i);
    });
  });

  describe("cleanupStorageFileInternal", () => {
    it("refuses to delete when caller userId does not own the storageId", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn((table: string) => {
            if (table === "pendingUploads") {
              return {
                withIndex: vi.fn(() => ({
                  first: vi.fn().mockResolvedValue({ userId: "other_user", storageId: "st_1" }),
                })),
              };
            }
            return {
              filter: vi.fn(() => ({
                first: vi.fn().mockResolvedValue(null),
              })),
            };
          }),
        },
        storage: {
          delete: vi.fn(),
        },
      };

      await (claims.cleanupStorageFileInternal as any)._handler(mockCtx, {
        storageId: "st_1" as any,
        userId: "attacker_user" as any,
      });

      expect(mockCtx.storage.delete).not.toHaveBeenCalled();
    });

    it("deletes file and removes pending upload when caller is the verified owner", async () => {
      const mockPending = {
        _id: "pending_to_delete",
        userId: "legit_user",
        storageId: "st_legit",
      };

      const mockCtx: any = {
        db: {
          query: vi.fn((table: string) => {
            if (table === "pendingUploads") {
              return {
                withIndex: vi.fn(() => ({
                  first: vi.fn().mockResolvedValue(mockPending),
                })),
              };
            }
            return {
              filter: vi.fn(() => ({
                first: vi.fn().mockResolvedValue(null),
              })),
            };
          }),
          delete: vi.fn().mockResolvedValue(undefined),
        },
        storage: {
          delete: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (claims.cleanupStorageFileInternal as any)._handler(mockCtx, {
        storageId: "st_legit" as any,
        userId: "legit_user" as any,
      });

      expect(mockCtx.storage.delete).toHaveBeenCalledWith("st_legit");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("pending_to_delete");
    });
  });

  describe("generateUploadUrl Quota with Pending Uploads", () => {
    it("accounts for unconsumed pending uploads in user storage file limits", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_quota_test" as any);

      // User has 49 claims with attachments and 1 unconsumed pending upload -> 50 total (reaches limit)
      const claimsWithFiles = Array.from({ length: 49 }, (_, i) => ({
        _id: `c_${i}`,
        userId: "user_quota_test",
        denialLetterStorageId: `st_${i}`,
      }));

      const pendingUploads = [
        {
          _id: "p_1",
          userId: "user_quota_test",
          storageId: "st_pending_1",
          status: "pending",
        },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn((table: string) => {
            if (table === "claims") {
              return {
                withIndex: vi.fn(() => ({
                  collect: vi.fn().mockResolvedValue(claimsWithFiles),
                })),
              };
            }
            if (table === "pendingUploads") {
              return {
                withIndex: vi.fn(() => ({
                  collect: vi.fn().mockResolvedValue(pendingUploads),
                })),
              };
            }
            return {
              withIndex: vi.fn(() => ({
                collect: vi.fn().mockResolvedValue([]),
              })),
            };
          }),
          system: {
            get: vi.fn().mockResolvedValue({ size: 1024 }),
          },
        },
        storage: {
          generateUploadUrl: vi.fn(),
        },
      };

      await expect(
        (claims.generateUploadUrl as any)._handler(mockCtx, {})
      ).rejects.toThrow(/Storage quota exceeded: You have reached the maximum document limit/i);

      expect(mockCtx.storage.generateUploadUrl).not.toHaveBeenCalled();
    });
  });
});
