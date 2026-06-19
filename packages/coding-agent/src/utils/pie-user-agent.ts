export function getPieUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `pie/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
