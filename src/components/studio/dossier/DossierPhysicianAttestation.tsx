import React from "react";
import { Certificate } from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";

interface DossierPhysicianAttestationProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const DossierPhysicianAttestation: React.FC<DossierPhysicianAttestationProps> = ({
  dossier,
  isPrintMode: _isPrintMode = false,
}) => {
  const phy = dossier.physicianInfo;

  return (
    <div
      id="section-physician-attestation"
      className="dossier-physician-attestation bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-5 shadow-xs [page-break-after:avoid] [break-after:avoid] print:border-none print:p-0 print:shadow-none"
    >
      {/* Attestation Header */}
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Certificate className="size-4.5 text-slate-900" />
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Formal Physician Attestation & Certificate of Medical Necessity
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-600">29 CFR § 2560.503-1</span>
      </div>

      {/* Formal Attestation Paragraph */}
      <div className="border border-slate-300 rounded-md p-4 bg-slate-50/70 space-y-3 text-xs leading-relaxed">
        <div className="font-serif text-[12.5px] font-bold text-slate-950 border-b border-slate-200 pb-2">
          DECLARATION OF TREATING CLINICIAN UNDER PENALTY OF ADMINISTRATIVE DISCIPLINE
        </div>

        <p className="text-slate-800">
          I, <strong>{phy.name}, {phy.credentials}</strong>, hereby declare and certify under penalty of perjury and administrative sanction under the laws of the United States of America that:
        </p>

        <ol className="list-decimal pl-5 space-y-1.5 text-slate-800 text-[11.5px]">
          <li>
            I am the licensed, treating physician directly responsible for the clinical evaluation, diagnosis, and management of <strong>{dossier.patientName}</strong> (Member ID: <strong>{dossier.memberId}</strong>).
          </li>
          <li>
            I have personally examined the patient, reviewed pertinent diagnostic imaging and laboratory findings, and substantiated the clinical diagnosis of <strong>{dossier.icd10Codes.join(", ") || "the condition identified on the claim"}</strong>.
          </li>
          <li>
            In my professional medical opinion, the ordered procedure (CPT <strong>{dossier.cptCodes.join(", ") || "the disputed service"}</strong>) is medically indicated, appropriate, and strictly necessary to prevent significant functional disability, pain progression, or disease deterioration.
          </li>
          <li>
            Conservative therapy, pharmacologic trials, and non-invasive modalities have been appropriately attempted and documented, or are clinically contraindicated for this patient.
          </li>
          <li>
            The requested treatment plan complies with published clinical guidelines and the insurer&apos;s published medical necessity thresholds.
          </li>
        </ol>

        {dossier.physicianNotes && (
          <div className="mt-3 p-3 bg-white rounded border border-slate-200 space-y-1">
            <div className="text-[10.5px] font-bold uppercase text-slate-600">
              Treating Clinician Addendum & Patient-Specific Findings:
            </div>
            <p className="text-xs text-slate-900 italic">
              &quot;{dossier.physicianNotes}&quot;
            </p>
          </div>
        )}
      </div>

      {/* Formal Signature & Credentials Block */}
      <div className="border border-slate-300 rounded-md p-5 bg-white space-y-5 [page-break-inside:avoid] [break-inside:avoid]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
          {/* Signature Line */}
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-bold text-slate-500 uppercase">
              Treating Clinician Signature
            </div>
            <div className="border-b-2 border-slate-900 pt-6 pb-1 font-serif text-base text-slate-900 italic flex items-baseline justify-between">
              <span>{phy.name}</span>
              <span className="text-[10px] font-sans text-slate-400 not-italic font-mono">[Digitally Verified]</span>
            </div>
            <div className="text-[10.5px] text-slate-500">
              Authorized Signature of Attending / Treating Physician
            </div>
          </div>

          {/* Date of Attestation */}
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-bold text-slate-500 uppercase">
              Date of Execution
            </div>
            <div className="border-b-2 border-slate-900 pt-6 pb-1 font-mono text-xs font-semibold text-slate-900">
              {phy.attestationDate}
            </div>
            <div className="text-[10.5px] text-slate-500">
              Conforms with Statutory Appeal Filing Period
            </div>
          </div>
        </div>

        {/* Clinician Professional Identifiers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-medium">Physician Name</div>
            <div className="font-bold text-slate-900">{phy.name}</div>
            <div className="text-[10px] text-slate-600">{phy.credentials}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-medium">National Provider ID</div>
            <div className="font-mono font-bold text-slate-900">{phy.npiNumber}</div>
            <div className="text-[10px] text-slate-600">State: {phy.medicalLicenseState}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-medium">Clinical Specialty</div>
            <div className="font-medium text-slate-900 truncate">{phy.specialty}</div>
            <div className="text-[10px] text-slate-600 truncate">{phy.facility}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-medium">Contact Tel / Email</div>
            <div className="font-mono text-slate-900 text-[11px] truncate">{phy.phone}</div>
            <div className="font-mono text-slate-600 text-[10px] truncate">{phy.email}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
