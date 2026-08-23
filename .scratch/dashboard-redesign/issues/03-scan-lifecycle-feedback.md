# 03: Make scan progress and failures actionable

**What to build:** A dashboard that clearly communicates ready, scanning, completed, and failed `اسکن` states, including accessible progress announcements and a safe retry path.

**Blocked by:** 01: Establish the Caffeine application shell; 02: Guide unconfigured users to their first scan.

**Status:** ready-for-agent

- [ ] Exactly one clear operational state explains whether the user must configure a `فروشگاه`, can start an `اسکن`, has an active `اسکن`, or needs to retry.
- [ ] Scan progress and completion are announced accessibly without relying solely on color or animation.
- [ ] Primary scan actions are available only when meaningful and do not hide dashboard content on mobile devices.
