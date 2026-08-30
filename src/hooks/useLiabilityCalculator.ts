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

export function useLiabilityCalculator(claim?: Claim | null) {
  const updateFinancialLiabilityMutation = useMutation((api as any).claims.updateFinancialLiability);
  const updateErisaPenaltiesMutation = useMutation((api as any).claims.updateErisaPenalties);

  // Financial Liability Input State
  const [financialInputs, setFinancialInputs] = useState<Partial<FinancialLiabilityData>>(() => {
    if (claim?.financialLiability) {
      return claim.financialLiability;
    }
    if (claim) {
      return getDefaultFinancialLiability(claim);
    }
    return {
      billedAmount: 24500,
      contractualDiscount: 3675,
      allowedAmount: 20825,
      deductibleTotal: 1500,
      deductibleMet: 500,
      coinsuranceRate: 20,
      copayAmount: 50,
      outOfPocketMax: 6000,
      outOfPocketSpent: 1800,
      networkStatus: "in_network",
      noSurprisesActProtected: true,
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
    const now = new Date();
    const requestDate = new Date(now.getTime() - 48 * 24 * 60 * 60 * 1000);
    return {
      documentRequestDate: requestDate.toISOString().split("T")[0],
      calculationDate: now.toISOString().split("T")[0],
      complianceStatus: "defaulted",
      dailyPenaltyRate: 110.0,
      statutoryInterestRate: 18,
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
        claimId: claim._id as any,
        financialLiability: liabilityResult.data,
      });

      await updateErisaPenaltiesMutation({
        claimId: claim._id as any,
        erisaPenalties: erisaResult.data,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to save liability calculations:", err);
      setErrorMessage(err.message || "Failed to save calculation to case");
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
  };
}
