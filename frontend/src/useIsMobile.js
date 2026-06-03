import { useEffect, useState } from 'react';

// Returns true when the viewport is at/below `bp` px wide. Used to switch the
// app's INLINE-style layouts to a phone-friendly arrangement — CSS @media rules
// can't override inline styles, so this hook is how those components go mobile.
export default function useIsMobile(bp = 768) {
  const query = `(max-width:${bp}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(query);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return isMobile;
}
