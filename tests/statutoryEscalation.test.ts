import { describe, it, expect } from 'vitest';
import {
  assembleProfessionalAppealEmail,
  getStatutoryRightsNotice,
} from '../convex/actions/appealSynthesizer';
import { getStatutoryTierMetadata } from '../convex/appeals';

describe('Multi-Tier Statutory Appeal Escalation Workflow', () => {
  const mockClaim = {
    claimNumber: 'CLM-9921-AET',
    serviceDate: '2026-05-18',
    deniedAmount: 48500,
    patientOwedAmount: 48500,
    providerName: 'Dr. Catherine Howard, MD, FACS',
    cptCodes: ['63047', '63048'],
    icd10Codes: ['M48.061', 'M51.16'],
    denialReasonCode: 'CO-50',
    denialReasonDescription: 'Procedure not deemed medically necessary per clinical guidelines',
    patient: {
      name: 'Arthur Pendelton',
      memberId: 'AET-7718293',
      groupNumber: 'GRP-4401',
      insurancePayer: 'Aetna Life Insurance Company',
    },
  };

  const mockEvidences = [
    {
      sourceType: 'payer_cpb',
      title: 'Aetna Clinical Policy Bulletin #0016: Lumbar Spine Surgery',
      sourceUrl: 'https://www.aetna.com/cpb/medical/data/1_99/0016.html',
      citationClause: 'Section 2.B (Lumbar Laminectomy)',
      extractedEvidenceMarkdown:
        'Severe neurogenic claudication with cross-sectional spinal canal narrowing (< 70 mm2 on MRI/CT+ refractory to 12 weeks of non-operative management.',
    },
  ];

  const mockSynthesisResult = {
    executiveSummary: 'Reconsideration request for Lumbar Decompression Claim #CLM-9921-AET.',
    medicalNecessityArguments:
      'Patient Arthur Pendelton presents with severe spinal stenosis and refractory neurogenic claudication after completing 16 weeks of structured physical therapy and dual epidural steroid injections.',
    statutoryRightsNotice: '',
    policyCitations: [
      {
        source: 'Aetna CPB #0016',
        clause: 'Section 2.B',
        quote: 'Spinal canal narrowing with intractable claudication',
      },
    ],
    formalDemandForPayment: 'Reprocess Claim #CLM-9921-AET for $48,500.',
    fullAppealMarkdown: '',
  };

  const mockSender = {
    name: 'Eleanor Vance',
    credentials: 'Legal Nurse Consultant & Appeals Specialist',
    email: 'e.vance@spine-institute.org',
    phone: '555-442-1920',
  };

  describe('Statutory Rights Notices & Tier Metadata', () => {
    it('provides distinct statutory rights notices for all 3 legal tiers', () => {
      const noticeLevel1 = getStatutoryRightsNotice('level_1_internal');
      const noticeLevel2 = getStatutoryRightsNotice('level_2_grievance');
      const noticeLevel3 = getStatutoryRightsNotice('level_3_external_state_review');

      expect(noticeLevel1).toContain('29 C.F.R. § 2560.503-1');
      expect(noticeLevel1).toContain('full and fair review');

      expect(noticeLevel2).toContain('ERISA Section 503');
      expect(noticeLevel2).toContain('29 C.F.R. § 2560.503-1(h)(3)(iii)');
      expect(noticeLevel2).toContain('same specialty');
      expect(noticeLevel2).toContain('bad-faith');

      expect(noticeLevel3).toContain('ERISA Section 502(a)(1)(B)');
      expect(noticeLevel3).toContain('45 C.F.R. § 147.136');
      expect(noticeLevel3).toContain('State Insurance Commissioner');
      expect(noticeLevel3).toContain('prompt-pay interest');
      expect(noticeLevel3).toContain('29 U.S.C. § 1132(g)(1)');
    });

    it('resolves accurate statutory posture and authorities in getStatutoryTierMetadata', () => {
      const metaL1 = getStatutoryTierMetadata('level_1_internal');
      expect(metaL1.statutoryPosture).toBe('administrative_reconsideration');
      expect(metaL1.targetAuthority).toBe('Payer Medical Director Review');
      expect(metaL1.legalAggressiveness).toBe('standard');

      const metaL2 = getStatutoryTierMetadata('level_2_grievance');
      expect(metaL2.statutoryPosture).toBe('procedural_grievance_bad_faith');
      expect(metaL2.targetAuthority).toContain('Peer Review Panel');
      expect(metaL2.legalAggressiveness).toBe('elevated_grievance');
      expect(metaL2.statutoryAuthorities).toContain('29 C.F.R. § 2560.503-1(h)(3)(iii) (Mandatory Same-Specialty Peer Review)');

      const metaL3 = getStatutoryTierMetadata('level_3_external_state_review');
      expect(metaL3.statutoryPosture).toBe('external_iro_erisa_502_petition');
      expect(metaL3.targetAuthority).toContain('External Independent Review Organization');
      expect(metaL3.legalAggressiveness).toBe('maximum_statutory_enforcement');
      expect(metaL3.statutoryAuthorities.some((a) => a.includes('ERISA: Section 502(a)(1)(B)') || a.includes('ERISA: Section 502(a)(1)(B)') || a.includes('ERISA: Section 502(') || a.includes('ERISA Section 502(a)(1)(B)'))).toBe(true);
    });
  });

  describe('Tier 1: Internal Administrative Appeal Assembly', () => {
    it('assembles Level 1 internal administrative appeal with standard ERISA posture', () => {
      const brief = assembleProfessionalAppealEmail(
        mockClaim,
        'level_1_internal',
        mockSynthesisResult,
        mockEvidences,
        'Patient exhibits severe central canal stenosis (< 65 mm2) and refractory bilateral radiculopathy.',
        undefined,
        mockSender
      );

      expect(brief).toContain('# Appeal of Adverse Benefit Determination');
      expect(brief).toContain('Dear Appeals and Grievances Team,');
      expect(brief).toContain('I request reconsideration of the adverse benefit determination for Claim #CLM-9921-AET');
      expect(brief).toContain('29 C.F.R. § 2560.503-1');
      expect(brief).toContain('$48,500');
      expect(brief).toContain('Dr. Catherine Howard, MD, FACS');
      expect(brief).toContain('Eleanor Vance');
    });
  });

  describe('Tier 2: Formal Grievance & Multi-Disciplinary Peer Review Panel', () => {
    it('assembles Level 2 formal grievance demanding same-specialty reviewer under 29 CFR § 2560.503-1(h)(3)(iii)', () => {
      const brief = assembleProfessionalAppealEmail(
        mockClaim,
        'level_2_grievance',
        mockSynthesisResult,
        mockEvidences,
        'Treating surgeon notes complete conservative failure and urgent surgical indication.',
        undefined,
        mockSender
      );

      expect(brief).toContain("# Appeal of Adverse Benefit Determination — Level 2 Formal Grievance");
      expect(brief).toContain("To the Multi-Disciplinary Peer Review Panel & Grievance Committee,");
      expect(brief).toContain("Level 2 Formal Grievance");
      expect(brief).toContain("ERISA Section 503");

      expect(brief).toContain("Convene a Multi-Disciplinary Peer Review Panel and assign an independent, board-certified physician in the same medical specialty");
      expect(brief).toContain("29 C.F.R. § 2560.503-1(h)(3)(iii)");
      expect(brief).toContain("Produce the name, specialty credentials, and clinical review notes of the initial adverse reviewer");

      expect(brief).toContain("FORMAL GRIEVANCE & ERISA § 503 PROCEDURAL NOTICE");
      expect(brief).toContain("reservation of rights regarding statutory bad-faith claims handling");
    });
  });

  describe("Tier 3: External IRO & State Insurance Commissioner Petition", () => {
    it("assembles Level 3 external review petition citing ERISA § 502(a)(1)(B) and statutory bad-faith penalties", () => {
      const brief = assembleProfessionalAppealEmail(
        mockClaim,
        "level_3_external_state_review",
        mockSynthesisResult,
        mockEvidences,
        "Treating surgeon addendum: Unwarranted denial has delayed urgent spinal decompression.",
        undefined,
        mockSender
      );

      expect(brief).toContain("# Appeal of Adverse Benefit Determination — Level 3 External IRO & State Insurance Commissioner Petition");
      expect(brief).toContain("To the Independent Review Organization (IRO), State Insurance Commissioner, and Plan Administrator,");
      expect(brief).toContain("Level 3 Petition for External Independent Review");

      expect(brief).toContain("Conduct expedited binding external independent review pursuant to ACA 45 C.F.R. § 147.136");
      expect(brief).toContain("State Insurance Commissioner review for unfair claims settlement practices");
      expect(brief).toContain("disbursement of the denied amount of $48,500 plus statutory prompt-pay interest penalties");
      expect(brief).toContain("ERISA Section 502(a)(1)(B) [29 U.S.C. § 1132(a)(1)(B)]");
      expect(brief).toContain("mandatory fee-shifting under ERISA Section 502(g)(1)");

      expect(brief).toContain("STATUTORY BAD-FAITH & ERISA SECTION 502(a)(1)(B) LITIGATION WARNING");
      expect(brief).toContain("Having exhausted available internal administrative appeals without a medically sound determination");
      expect(brief).toContain("formal complaint to the State Insurance Commissioner");
      expect(brief).toContain("reserves all civil enforcement remedies under ERISA Section 502(a)(1)(B)");
    });
  });
});