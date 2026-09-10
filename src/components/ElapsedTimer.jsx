import { useState, useEffect } from 'react';

/**
 * Pure telemetry stopwatch for active resolving/downloading queue cards.
 * Encapsulates its own interval to prevent re-rendering the parent tree.
 */
function ElapsedTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(() => {
    if (!startTime) return 0;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 500);

    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const formatted = mins > 0 
    ? `${mins}m ${secs < 10 ? '0' : ''}${secs}s` 
    : `${secs}s`;

  return (
    <span className="telemetry-timer" title="Elapsed stream connection time">
      <span className="pulse-led" />
      {formatted}
    </span>
  );
}

export default ElapsedTimer;
