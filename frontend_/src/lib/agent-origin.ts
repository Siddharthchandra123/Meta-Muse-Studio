/**
 * Cross-origin protection for local-only research actions.
 * The browser and Next.js may disagree about the canonical loopback hostname.
 * Treat localhost and 127.0.0.1 as equivalent ONLY on the same HTTP port.
 * Never allow other hosts, other ports or a protocol downgrade.
 */
export function isAllowedAgentOrigin(origin: string | null, requestUrl: string): boolean {
  if (origin === null) return true; // CLI clients do not send an Origin header.
  try {
    const supplied = new URL(origin);
    const target = new URL(requestUrl);
    // Exact same-origin remains valid, including legitimate nonlocal deployments.
    if (supplied.origin === target.origin) return true;
    const loopback = new Set(['localhost', '127.0.0.1']);
    return supplied.protocol === 'http:'
      && target.protocol === 'http:'
      && loopback.has(supplied.hostname)
      && loopback.has(target.hostname)
      && supplied.port === target.port
      && supplied.pathname === '/'
      && !supplied.search && !supplied.hash
      && !supplied.username && !supplied.password;
  } catch {
    return false;
  }
}
