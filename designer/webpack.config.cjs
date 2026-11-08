const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const DEV_PORT = 8095; // keep in sync with config/bitbrick.php (BITBRICK_DEV_SERVER)

module.exports = (env, argv) => {
	const dev = argv.mode === 'development';

	return {
		entry: './src/index.js',
		output: {
			filename: 'bundle.js',
			chunkFilename: '[name].[contenthash:8].js',
			// Development writes to ./build so it never clobbers the production bundle.
			path: dev ? path.resolve(__dirname, 'build') : path.resolve(__dirname, '../public/designer-production'),
			clean: true,
			// Static (not 'auto'): the mesh worker is started from a blob (src/geometry/workerFactory.js),
			// where 'auto' cannot work out where the chunks live.
			publicPath: dev ? `http://localhost:${DEV_PORT}/` : '/designer-production/',
		},
		devtool: dev ? 'eval-cheap-module-source-map' : false,
		devServer: {
			port: DEV_PORT,
			static: './build',
			// The bundle is requested from the Laravel page, which is another origin.
			headers: { 'Access-Control-Allow-Origin': '*' },
			allowedHosts: 'all',
			historyApiFallback: true,
			hot: false,
			liveReload: true,
			client: { overlay: { runtimeErrors: (e) => !/ResizeObserver loop/.test(e?.message || '') } },
		},
		module: {
			parser: {
				javascript: {
					// "new BitBrickWorker(new URL(...))" is bundled like "new Worker(new URL(...))".
					worker: ['BitBrickWorker', '...'],
				},
			},
			rules: [
				{
					test: /\.jsx?$/,
					exclude: /node_modules/,
					use: {
						loader: 'babel-loader',
						options: { presets: [['@babel/preset-env', { targets: 'defaults' }], ['@babel/preset-react', { runtime: 'automatic' }]] },
					},
				},
				{ test: /\.css$/i, use: ['style-loader', 'css-loader'] },
				{ test: /\.hdr\.jpg$/i, type: 'asset/resource', generator: { filename: 'assets/[name].[contenthash:8][ext]' } },
				{ test: /\.wasm$/i, type: 'asset/resource', generator: { filename: 'assets/[name].[contenthash:8][ext]' } },
			],
		},
		resolve: {
			extensions: ['.js', '.jsx'],
			fallback: { fs: false, path: false, url: false, module: false, crypto: false, worker_threads: false },
		},
		// One self-contained worker chunk: a blob worker cannot resolve relative chunk URLs.
		optimization: { splitChunks: false },
		performance: { hints: false },
		plugins: [
			new HtmlWebpackPlugin({ template: 'src/index.html' }),
			// manifold-3d's emscripten loader mentions node built-ins that are never reached in a browser.
			new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => { r.request = r.request.replace(/^node:/, ''); }),
			new webpack.DefinePlugin({ 'process.env.MODE': JSON.stringify(argv.mode) }),
		],
	};
};
