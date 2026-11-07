// The bundle may be served by the webpack dev server (another origin than the Laravel page, see
// "side-loading"), and browsers refuse cross-origin Worker URLs. A blob that importScripts() the
// real worker works in both cases. webpack is told to treat BitBrickWorker like Worker.
globalThis.BitBrickWorker = function BitBrickWorker(url, options) {
	const absolute = new URL(String(url), self.location.href).href;
	// A blob worker has no useful base URL, so it is told the page origin to resolve relative URLs (the wasm file).
	const prelude = `self.__BITBRICK_ORIGIN__ = ${JSON.stringify(self.location.origin)};`;
	const blob = new Blob([`${prelude}importScripts(${JSON.stringify(absolute)});`], { type: 'text/javascript' });
	const objectUrl = URL.createObjectURL(blob);
	const worker = new Worker(objectUrl, options);
	setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
	return worker;
};
