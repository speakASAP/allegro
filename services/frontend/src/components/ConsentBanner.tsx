import { useEffect } from 'react';
// Vendored from shared/packages/consent — refresh with shared/scripts/sync-consent.sh.
import { mountConsentBanner } from '../lib/consent/consent-banner.js';

/** Bump when the wording changes; visitors are then asked again. */
const CONSENT_VERSION = 'alfares-consent-v1';

/**
 * Declares strictly necessary storage only — this panel runs no analytics or
 * marketing scripts, so there is nothing optional to opt out of.
 */
export default function ConsentBanner() {
  useEffect(() => {
    const banner = mountConsentBanner({
      version: CONSENT_VERSION,
      policyUrl: 'https://alfares.cz/cs/legal/cookie-policy',
      text: {
        title: 'Cookies a úložiště',
        disclosureBody:
          'Ukládáme jen údaje nezbytné pro přihlášení a chod služby. Nepoužíváme analytické ani marketingové cookies.',
        acknowledge: 'Rozumím',
        policyLabel: 'Zásady cookies',
      },
    });

    return () => banner.destroy();
  }, []);

  return null;
}
