import { useState, useEffect, useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Claim,
  FinancialLiabilityData,
  FinancialLiabilityResult,
  ErisaPenaltyData,
  ErisaPenaltyResult,
} from "../types";
import {
  calculateFinancialLiability,
  calculateErisaPenalties,
  getDefaultFinancialLiability,
  getDefaultErisaPenalties,
} from "../lib/liabilityCalculator";

import { Id } from "../../convex/_generated/dataModel";

export function useLiabilityCalculator(claim?: Claim | null) {
  const updateFinancialLiabilityMutation = useMutation(api.claims.updateFinancialLiability);
  const updateErisaPenaltiesMutation = useMutation(api.claims.updateErisaPenalties);

  // Financial Liability Input State
  const [financialInputs, setFinancialInputs] = useState<Partial<FinancialLiabilityData>>(() => {
    if (claim?.financialLiability) {
      return claim.financialLiability;
    }
    if (claim) {
      return getDefaultFinancialLiability(claim);
    }
    return {
      billedAmount: 0,
      contractualDiscount: 0,
      allowedAmount: 0,
      deductibleTotal: 0,
      deductibleMet: 0,
      coinsuranceRate: 0,
      copayAmount: 0,
      outOfPocketMax: 0,
      outOfPocketSpent: 0,
      networkStatus: "in_network",
      noSurprisesActProtected: false,
    };
  });

  // ERISA Penalty Input State
  const [erisaInputs, setErisaInputs] = useState<Partial<ErisaPenaltyData>>(() => {
    if (claim?.erisaPenalties) {
      return claim.erisaPenalties;
    }
    if (claim) {
      return getDefaultErisaPenalties(claim);
    }
    return {
      complianceStatus: "compliant",
      dailyPenaltyRate: 110.0,
      statutoryInterestRate: 0,
      requestedDocuments: [],
    };
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset inputs when selected claim changes
  useEffect(() => {
    if (claim) {
      if (claim.financialLiability) {
        setFinancialInputs(claim.financialLiability);
      } else {
        setFinancialInputs(getDefaultFinancialLiability(claim));
      }

      if (claim.erisaPenalties) {
        setErisaInputs(claim.erisaPenalties);
      } else {
        setErisaInputs(getDefaultErisaPenalties(claim));
      }
    } else {
      setFinancialInputs({
        billedAmount: 0,
        contractualDiscount: 0,
        allowedAmount: 0,
        deductibleTotal: 0,
        deductibleMet: 0,
        coinsuranceRate: 0,
        copayAmount: 0,
        outOfPocketMax: 0,
        outOfPocketSpent: 0,
        networkStatus: "in_network",
        noSurprisesActProtected: false,
      });
      setErisaInputs({
        complianceStatus: "compliant",
        dailyPenaltyRate: 110.0,
        statutoryInterestRate: 0,
        requestedDocuments: [],
      });
    }
  }, [claim?._id]);

  // Derived Reactive Calculations
  const liabilityResult: FinancialLiabilityResult = useMemo(() => {
    return calculateFinancialLiability(financialInputs, {
      deniedAmount: claim?.deniedAmount,
      patientOwedAmount: claim?.patientOwedAmount,
    });
  }, [financialInputs, claim?.deniedAmount, claim?.patientOwedAmount]);

  const erisaResult: ErisaPenaltyResult = useMemo(() => {
    return calculateErisaPenalties(erisaInputs, {
      deniedAmount: claim?.deniedAmount || financialInputs.billedAmount,
      patientName: claim?.patient?.name,
      payerName: claim?.patient?.insurancePayer,
      claimNumber: claim?.claimNumber,
      serviceDate: claim?.serviceDate,
    });
  }, [
    erisaInputs,
    claim?.deniedAmount,
    claim?.patient?.name,
    claim?.patient?.insurancePayer,
    claim?.claimNumber,
    claim?.serviceDate,
    financialInputs.billedAmount,
  ]);

  const updateFinancialField = useCallback(
    <K extends keyof FinancialLiabilityData>(field: K, value: FinancialLiabilityData[K]) => {
      setFinancialInputs((prev) => {
        const next = { ...prev, [field]: value };
        // Auto-compute allowed amount if billed or discount changes
        if (field === "billedAmount" || field === "contractualDiscount") {
          const billed = Number(field === "billedAmount" ? value : next.billedAmount ?? 0);
          const disc = Number(field === "contractualDiscount" ? value : next.contractualDiscount ?? 0);
          next.allowedAmount = Math.max(0, billed - disc);
        }
        return next;
      });
      setSaveSuccess(false);
    },
    []
  );

  const updateErisaField = useCallback(
    <K extends keyof ErisaPenaltyData>(field: K, value: ErisaPenaltyData[K]) => {
      setErisaInputs((prev) => ({ ...prev, [field]: value }));
      setSaveSuccess(false);
    },
    []
  );

  const saveToClaim = useCallback(async () => {
    if (!claim?._id) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateFinancialLiabilityMutation({
        claimId: claim._id as Id<"claims">,
        financialLiability: liabilityResult.data,
      });

      await updateErisaPenaltiesMutation({
        claimId: claim._id as Id<"claims">,
        erisaPenalties: erisaResult.data,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save liability calculations:", err);
      const message = err instanceof Error ? err.message : "Failed to save calculation to case";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }, [claim?._id, liabilityResult.data, erisaResult.data, updateFinancialLiabilityMutation, updateErisaPenaltiesMutation]);

  return {
    financialInputs,
    setFinancialInputs,
    updateFinancialField,
    liabilityResult,
    erisaInputs,
    setErisaInputs,
    updateErisaField,
    erisaResult,
    isSaving,
    saveSuccess,
    errorMessage,
    saveToClaim,
    hasClaim: Boolean(claim),
  };
}
