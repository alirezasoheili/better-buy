import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  pushRegistration,
  pushSupported,
  removeSubscription,
  saveSubscription,
  urlBase64ToUint8Array,
} from "./push";

export function PushSettings({
  publicKey,
  loading,
}: {
  publicKey: string | null;
  loading: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null
  );
  const [busy, setBusy] = useState(true);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let mounted = true;
    const supported = pushSupported();
    setSupported(supported);
    if (!supported) {
      setBusy(false);
      return;
    }
    setPermission(Notification.permission);
    void pushRegistration()
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (mounted) setSubscription(existing);
      })
      .catch(() => {
        if (mounted)
          setError(
            "راه‌اندازی اعلان مرورگر انجام نشد؛ می‌توانید دوباره تلاش کنید."
          );
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const enable = async () => {
    if (busy || !publicKey || !supported) return;
    setBusy(true);
    setError("");
    setNotice("");
    let created: PushSubscription | null = null;
    try {
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      if (applicationServerKey.length !== 65 || applicationServerKey[0] !== 4)
        throw new Error(
          "کلید اعلان مرورگر معتبر نیست؛ با پشتیبانی تماس بگیرید."
        );
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermission(permission);
      if (permission !== "granted") {
        setNotice(
          permission === "denied"
            ? "اجازه اعلان مسدود است. آن را از تنظیمات مرورگر تغییر دهید."
            : "اجازه اعلان داده نشد؛ هر زمان خواستید دوباره تلاش کنید."
        );
        return;
      }
      const registration = await pushRegistration();
      let current = await registration.pushManager.getSubscription();
      if (!current) {
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        created = current;
      }
      setSubscription(current);
      await saveSubscription(current);
      setSynced(true);
      setNotice("اعلان مرورگر برای این حساب فعال شد.");
    } catch (error) {
      if (created) {
        try {
          if (await created.unsubscribe()) setSubscription(null);
        } catch {}
      }
      setSynced(false);
      setError(
        error instanceof Error && /[؀-ۿ]/.test(error.message)
          ? error.message
          : "فعال‌سازی اعلان مرورگر انجام نشد؛ دوباره تلاش کنید."
      );
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    if (!subscription || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await removeSubscription(subscription);
      setSubscription(null);
      setSynced(false);
      setNotice("اعلان مرورگر در این دستگاه غیرفعال شد.");
    } catch (error) {
      setError(
        error instanceof Error && /[؀-ۿ]/.test(error.message)
          ? error.message
          : "غیرفعال‌سازی انجام نشد؛ دوباره تلاش کنید."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="push-settings" aria-labelledby="push-heading">
      <h3 id="push-heading">اعلان مرورگر و برنامه نصب‌شده</h3>
      <p className="muted">
        این تنظیم برای همین مرورگر یا نسخه نصب‌شده بهتر بخر است. در آیفون و
        آیپد، ابتدا برنامه را به صفحه اصلی اضافه و از همان‌جا باز کنید.
      </p>
      {supported === false && (
        <p role="status">
          اعلان در این مرورگر در دسترس نیست؛ از مرورگر سازگار و اتصال امن
          استفاده کنید. صندوق اعلان‌ها همچنان در دسترس است.
        </p>
      )}
      {supported && (
        <>
          {!loading && !publicKey && (
            <p role="status">
              اعلان مرورگر هنوز از سمت سرویس پیکربندی نشده است.
            </p>
          )}
          {permission === "denied" && (
            <p role="status">
              اجازه اعلان مسدود است؛ برای فعال‌سازی، تنظیمات اعلان این سایت را
              در مرورگر تغییر دهید.
            </p>
          )}
          {subscription && (
            <p>
              {synced
                ? "اعلان برای این حساب فعال است."
                : "این مرورگر اشتراک دارد؛ برای اتصال آن به حساب فعلی، همگام‌سازی کنید."}
            </p>
          )}
          <div className="alerts-actions">
            <Button
              disabled={
                busy ||
                loading ||
                !publicKey ||
                permission === "denied" ||
                synced
              }
              onClick={() => void enable()}
            >
              {busy
                ? "در حال بررسی…"
                : subscription
                  ? "همگام‌سازی اعلان با حساب"
                  : "فعال‌سازی اعلان مرورگر"}
            </Button>
            {subscription && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void disable()}
              >
                غیرفعال‌سازی در این دستگاه
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
