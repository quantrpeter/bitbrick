// Small stroke icon set (24 x 24), drawn for this project. Decorative: always aria-hidden.
const ICONS = {
	cube: <><path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7z" /><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" /></>,
	gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
	layers: <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>,
	clear: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m9 9 6 6M15 9l-6 6" /></>,
	share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
	download: <path d="M12 3v12M7 10.5l5 5 5-5M4 20h16" />,
	save: <><path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M8 3v5h7V3M7 21v-7h10v7" /></>,
	undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
	redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
	mirror: <><path d="M12 3v18" /><path d="M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z" /></>,
	fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
	search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
	chevron: <path d="m6 9 6 6 6-6" />,
	pinHole: <><circle cx="12" cy="12" r="10.5" /><circle cx="12" cy="12" r="4.5" /></>,
	axleHole: <path d="M12 3.5v17M3.5 12h17" />,
	pin: <rect x="3" y="2.5" width="18" height="18" rx="12" />,
	axle: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
	solid: <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />,
	ballJoint: <><circle cx="12" cy="8.5" r="4.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
	trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />,
	bounds: <path d="M4 5v14M20 5v14M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" />,
	style: <><path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7z" /><path d="M3.5 7 12 11.5 20.5 7" /></>,
	blocks: <><path d="M8 3 3 5.8v5.4L8 14l5-2.8V5.8z" /><path d="M16 10l-5 2.8v5.4L16 21l5-2.8v-5.4z" /></>,
	size: <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5M8 12h8M10 10l-2 2 2 2M14 10l2 2-2 2" />,
	filePlus: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></>,
	file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
	folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
	saveAs: <><path d="M5 3h11l4 4v6M5 3a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h7" /><path d="M8 3v5h7V3M7 20v-6h4M16 21l5-5-2-2-5 5v2z" /></>,
	edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
	check: <path d="m5 12 5 5 9-10" />,
	close: <path d="M6 6l12 12M18 6 6 18" />,
	volume: <><path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2z" /><path d="M12 12v9M4.5 7.2 12 12l7.5-4.8" /></>,
};

export default function Icon({ name, size = 18, className = '' }) {
	return (
		<svg
			className={`icon ${className}`}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{ICONS[name]}
		</svg>
	);
}

/** The BitBrick mark: a yellow beam with four holes. */
export function Logo({ height = 40 }) {
	return (
		<svg viewBox="0 0 96 48" height={height} aria-hidden="true" focusable="false">
			<g transform="rotate(-18 48 24)">
				<rect x="6" y="9" width="84" height="30" rx="15" fill="#ffc800" stroke="#0d1f4a" strokeWidth="4" />
				{[25, 41, 57, 73].map((x) => <circle key={x} cx={x} cy="24" r="5.5" fill="#0d1f4a" />)}
			</g>
		</svg>
	);
}
