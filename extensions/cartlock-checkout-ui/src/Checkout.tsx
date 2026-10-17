import { useEffect, useState } from "react";
import {
  reactExtension,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  useAttributeValues,
  useDiscountAllocations,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.checkout.block.render", () => (
  <CartLockCheckoutBanner />
));

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CartLockCheckoutBanner() {
  const [expiresAtRaw, signatureRaw] = useAttributeValues([
    "_cartlock_expires_at",
    "_cartlock_signature",
  ]);
  const discountAllocations = useDiscountAllocations();
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAtRaw) {
      setSecondsRemaining(null);
      return;
    }

    const parseTime = (val: string) => {
      if (/^\d+$/.test(val.trim())) {
        const num = Number(val.trim());
        return num < 1e12 ? num * 1000 : num;
      }
      return Date.parse(val);
    };

    const targetMs = parseTime(expiresAtRaw);
    if (!Number.isFinite(targetMs)) {
      setSecondsRemaining(null);
      return;
    }

    const updateTimer = () => {
      const rem = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      setSecondsRemaining(rem);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAtRaw]);

  if (!expiresAtRaw || !signatureRaw || secondsRemaining === null) {
    return null;
  }

  // Sum total discount allocated by CartLock automatic discount
  const lockedSavings = (discountAllocations || []).reduce((acc, alloc) => {
    const amount = Number(alloc?.discountedAmount?.amount ?? 0);
    return acc + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  if (secondsRemaining <= 0) {
    return (
      <Banner status="warning" title="CartLock Price Reservation Expired">
        <Text size="small" appearance="subdued">
          Your reserved price window has ended and checkout pricing has reverted
          to standard catalog rates.
        </Text>
      </Banner>
    );
  }

  return (
    <Banner
      status={secondsRemaining <= 120 ? "warning" : "success"}
      title="CartLock Price Reservation Active"
    >
      <BlockStack spacing="extraTight">
        <InlineStack spacing="tight" blockAlignment="center">
          <Badge tone={secondsRemaining <= 120 ? "warning" : "success"}>
            {`Expires in ${formatClock(secondsRemaining)}`}
          </Badge>
          {lockedSavings > 0 && (
            <Badge tone="info">{`$${lockedSavings.toFixed(2)} Locked Savings`}</Badge>
          )}
        </InlineStack>
        <Text size="small" appearance="subdued">
          {lockedSavings > 0
            ? `Your cryptographically verified $${lockedSavings.toFixed(2)} price drop is locked for ${formatClock(secondsRemaining)}. Complete checkout before the timer reaches 00:00.`
            : `Your cart reservation is active for ${formatClock(secondsRemaining)}. Complete checkout before the timer reaches 00:00 to preserve your locked offer.`}
        </Text>
      </BlockStack>
    </Banner>
  );
}
