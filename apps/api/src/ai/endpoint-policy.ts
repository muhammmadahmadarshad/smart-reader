import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as guardedFetch } from 'undici';
import { AssistantConfig } from './assistant.config';

export function permittedAddress(address: string, privateAllowed: boolean) {
  const ip = ipaddr.process(address),
    range = ip.range();
  // Link-local/cloud metadata, multicast, unspecified and broadcast are never permitted.
  return (
    range === 'unicast' ||
    (privateAllowed && ['private', 'loopback', 'uniqueLocal'].includes(range))
  );
}
@Injectable()
export class EndpointPolicy {
  constructor(private readonly config: AssistantConfig) {}
  validate(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Enter an absolute endpoint URL.');
    }
    const privateAllowed = this.config
      .get('AI_ALLOWED_PRIVATE_ORIGINS')
      .split(',')
      .includes(url.origin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['https:', ...(privateAllowed ? ['http:'] : [])].includes(url.protocol)
    )
      throw new BadRequestException(
        'Endpoints require HTTPS and cannot include credentials, a query or fragment. Private HTTP requires an administrator allowlist.',
      );
    if (/metadata|169\.254\.|100\.100\.100\.200/i.test(url.hostname))
      throw new BadRequestException('Metadata endpoints are forbidden.');
    return { url, privateAllowed };
  }
  async resolve(raw: string) {
    const { url, privateAllowed } = this.validate(raw);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = ipaddr.isValid(hostname)
      ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
      : await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some((a) => !permittedAddress(a.address, privateAllowed)))
      throw new BadRequestException(
        'This endpoint resolves to a destination not permitted by the administrator.',
      );
    return { url, addresses };
  }
  /** Every request pins the checked DNS address; redirects and cross-origin credential forwarding fail. */
  fetchFor(base: string, observer?: (json: unknown) => void): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = new URL(
        typeof input === 'string' || input instanceof URL ? String(input) : input.url,
      );
      const expected = this.validate(base).url;
      if (target.origin !== expected.origin)
        throw new BadRequestException('Provider attempted to change endpoint origin.');
      const { addresses } = await this.resolve(target.origin);
      const agent = new Agent({
        connect: {
          lookup: (_host, options, callback) => {
            const chosen = addresses[0];
            if (options.all) callback(null, addresses);
            else callback(null, chosen.address, chosen.family);
          },
        },
      });
      try {
        const original = typeof input === 'object' && !(input instanceof URL) ? input : undefined;
        const response = await guardedFetch(target, {
          method: init?.method ?? original?.method,
          headers: Object.fromEntries(new Headers(init?.headers ?? original?.headers).entries()),
          body: init?.body as string | undefined,
          redirect: 'error',
          dispatcher: agent,
          signal: AbortSignal.any([
            AbortSignal.timeout(this.config.timeout),
            ...(init?.signal ? [init.signal] : []),
          ]),
        });
        let size = 0;
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        const body = reader
          ? new ReadableStream<Uint8Array>({
              async pull(controller) {
                try {
                  const chunk = await reader.read();
                  if (chunk.done) {
                    controller.close();
                    void agent.close();
                    if (observer) {
                      try {
                        observer(JSON.parse(Buffer.concat(chunks).toString()));
                      } catch {
                        /* no usage available */
                      }
                    }
                    return;
                  }
                  size += chunk.value.length;
                  if (size > 2 * 1024 * 1024) throw new Error('Provider response exceeds limit.');
                  if (observer) chunks.push(chunk.value);
                  controller.enqueue(chunk.value);
                } catch {
                  controller.error(new Error('Provider transport failed or exceeded limits.'));
                  await reader.cancel().catch(() => undefined);
                  void agent.close();
                }
              },
              async cancel() {
                await reader.cancel();
                void agent.close();
              },
            })
          : null;
        if (!reader) void agent.close();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(response.headers.entries()),
        });
      } catch (error) {
        void agent.close();
        throw error;
      }
    }) as typeof fetch;
  }
}
