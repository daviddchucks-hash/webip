import dns from "node:dns/promises";
import net from "node:net";
import { logger } from "./logger";

export interface IpInfoResult {
  ip: string;
  ipVersion: string | null;
  hostname: string | null;
  reverseDns: string | null;
  isp: string | null;
  asn: string | null;
  organization: string | null;
  continent: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  currencyName: string | null;
  currencyCode: string | null;
  languages: string | null;
  network: string | null;
  connectionType: string | null;
  hostingProvider: boolean | null;
  isProxy: boolean | null;
  whois: string | null;
}

interface IpApiResponse {
  status: string;
  message?: string;
  query: string;
  continent?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  currency?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  reverse?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
}

const IP_API_FIELDS =
  "status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query";

export function isValidIp(ip: string): boolean {
  return net.isIP(ip) !== 0;
}

/**
 * Fetches public geolocation / network info for an IP from ip-api.com
 * (free, no API key required for non-commercial use).
 */
async function fetchIpApiInfo(ip: string): Promise<IpApiResponse | null> {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${IP_API_FIELDS}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as IpApiResponse;
    if (data.status !== "success") return null;
    return data;
  } catch (err) {
    logger.warn({ err, ip }, "ip-api lookup failed");
    return null;
  }
}

async function fetchReverseDns(ip: string): Promise<string | null> {
  try {
    const names = await dns.reverse(ip);
    return names[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Minimal WHOIS client: queries IANA to find the authoritative registry,
 * then follows the referral to fetch the actual WHOIS record.
 */
async function fetchWhois(query: string): Promise<string | null> {
  try {
    const initial = await whoisQuery(query, "whois.iana.org");
    if (!initial) return null;

    const referMatch = initial.match(/refer:\s*(\S+)/i);
    const whoisMatch = initial.match(/whois:\s*(\S+)/i);
    const referralServer = referMatch?.[1] ?? whoisMatch?.[1];

    if (referralServer && referralServer !== "whois.iana.org") {
      const detailed = await whoisQuery(query, referralServer);
      if (detailed) return detailed;
    }

    return initial;
  } catch (err) {
    logger.warn({ err, query }, "whois lookup failed");
    return null;
  }
}

function whoisQuery(query: string, server: string): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: server, port: 43 });
    let data = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(data || null);
    }, 6000);

    socket.on("connect", () => {
      socket.write(`${query}\r\n`);
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => {
      clearTimeout(timeout);
      resolve(data || null);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(data || null);
    });
  });
}

export async function lookupIpAddress(ip: string): Promise<IpInfoResult> {
  const [apiInfo, reverseDns] = await Promise.all([
    fetchIpApiInfo(ip),
    fetchReverseDns(ip),
  ]);

  const whois = await fetchWhois(ip);

  const ipVersion = net.isIP(ip) === 6 ? "IPv6" : net.isIP(ip) === 4 ? "IPv4" : null;

  return {
    ip,
    ipVersion,
    hostname: reverseDns,
    reverseDns,
    isp: apiInfo?.isp ?? null,
    asn: apiInfo?.as ?? apiInfo?.asname ?? null,
    organization: apiInfo?.org ?? null,
    continent: apiInfo?.continent ?? null,
    country: apiInfo?.country ?? null,
    countryCode: apiInfo?.countryCode ?? null,
    region: apiInfo?.regionName ?? apiInfo?.region ?? null,
    city: apiInfo?.city ?? null,
    postalCode: apiInfo?.zip ?? null,
    timezone: apiInfo?.timezone ?? null,
    latitude: apiInfo?.lat ?? null,
    longitude: apiInfo?.lon ?? null,
    googleMapsUrl:
      apiInfo?.lat != null && apiInfo?.lon != null
        ? `https://www.google.com/maps?q=${apiInfo.lat},${apiInfo.lon}`
        : null,
    currencyName: apiInfo?.currency ?? null,
    currencyCode: apiInfo?.currency ?? null,
    languages: null,
    network: apiInfo?.asname ?? null,
    connectionType: apiInfo?.mobile ? "Mobile" : "Fixed/Broadband",
    hostingProvider: apiInfo?.hosting ?? null,
    isProxy: apiInfo?.proxy ?? null,
    whois,
  };
}
