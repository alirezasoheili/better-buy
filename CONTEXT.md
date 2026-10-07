# Better Buy Context

## Glossary

| Term         | Meaning                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| فروشگاه      | A supported online grocery service whose deals Better Buy can scan and compare. SnappMarket and Okala are supported stores. |
| موقعیت تحویل | A saved delivery location that determines the prices and availability returned by a store.                                  |
| اسکن         | A user-initiated collection of eligible deals for a delivery location from one or more supported stores.                    |
| پیشنهاد      | A discounted, available product returned by a scan and shown for comparison.                                                |

## Language Rules

- Use `فروشگاه` in the Persian interface. Do not use mixed labels such as provider, source, or store for this concept.

## Provider access

Better Buy requires Google/Better Auth sign-in for all application data and scans. SnappMarket requires no customer login or settings row: its collector obtains and manages a public PWA guest session for the exact vendor-grouped `/market-party/{latitude}/{longitude}` feed. One device ID identifies that session and its requests. Okala uses public nearby-store and campaign endpoints without customer or guest credentials, settings prerequisites, or refresh. Collection covers the promotional campaign feed; absence is not proof of worldwide stock unavailability. Digikala Jet remains disabled for new scans and settings, with history readable.
