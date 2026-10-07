import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ProviderSettingsStatus } from "@better-buy/shared";
import { api } from "../../lib/api";
export function useOkalaLogin(
  onSaved: (value: ProviderSettingsStatus) => void
) {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const mutation = useMutation({
    mutationFn: async (input: {
      verify: boolean;
      mobile: string;
      otp: string;
    }) => {
      if (input.verify)
        return api<ProviderSettingsStatus>("/api/settings/okala/login", {
          method: "POST",
          body: JSON.stringify({ mobile: input.mobile, otp: input.otp }),
        });
      await api("/api/settings/okala/otp", {
        method: "POST",
        body: JSON.stringify({ mobile: input.mobile }),
      });
      return null;
    },
  });
  const submit = (verify: boolean) => {
    if (mutation.isPending) return;
    mutation.mutate(
      { verify, mobile, otp },
      {
        onSuccess: (value) => {
          if (value) {
            onSaved(value);
            setOtp("");
          } else setStep("otp");
        },
      }
    );
  };
  return {
    mobile,
    setMobile,
    otp,
    setOtp,
    step,
    setStep,
    saving: mutation.isPending,
    error: mutation.error?.message ?? "",
    resetLogin: () => mutation.reset(),
    submit,
  };
}
