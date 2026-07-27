/** "0x1234…abcd" style display form of an EVM address. */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
