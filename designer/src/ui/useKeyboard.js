import { useEffect } from 'react';
import {
	moveCursor, applyBrush, removeAtCursor, setTypeByIndex, undo, redo, getState,
	movePlacement, orientPlacement, cancelPlacement, confirmPlacement,
} from '../state/store.js';
import { saveProject } from '../state/actions.js';
import { AXIS_FROM_USER } from '../model/axes.js';

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function useKeyboard() {
	useEffect(() => {
		const onKey = (e) => {
			const mod = e.ctrlKey || e.metaKey;
			const key = e.key;

			// A dialog is open: it handles its own keys.
			if (getState().dialog) return;

			if (mod && !e.altKey) {
				if (key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
				if (isTyping(e.target)) return; // let text fields keep their own undo
				if (key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
				if (key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
				return;
			}
			if (e.altKey || isTyping(e.target)) return;
			// Space/Enter on a focused button must still click it.
			const onButton = e.target && e.target.tagName === 'BUTTON';

			const k = key.length === 1 ? key.toLowerCase() : key;
			// X: left/right. Y (away from you / towards you): up/down arrows. Z (height): w / s.
			// Cursor deltas are in stored axes (y is up, -z is away), see model/axes.js.
			const moves = {
				ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0],
				ArrowUp: [0, 0, -1], ArrowDown: [0, 0, 1],
				w: [0, 1, 0], s: [0, -1, 0],
				PageUp: [0, 1, 0], PageDown: [0, -1, 0], // kept for keyboards that have them
			};

			// Placing a catalog preset: the same keys move the transparent preview; Enter or a click places it.
			if (getState().placement) {
				if (k === 'Escape') { e.preventDefault(); cancelPlacement(); return; }
				if (k === 'Enter') { e.preventDefault(); confirmPlacement(); return; }
				if (moves[k]) { e.preventDefault(); movePlacement(moves[k]); return; }
				// x / y / z point the part along that axis; the same key again reverses it
				if (AXIS_FROM_USER[k]) { e.preventDefault(); orientPlacement(k); }
				return; // block-editing keys do nothing until the preset is placed or cancelled
			}

			if (moves[k]) { e.preventDefault(); moveCursor(moves[k]); return; }

			if (k >= '1' && k <= '7') { setTypeByIndex(Number(k) - 1); return; }
			// x / y / z pick the hole direction in the user's axes: X and Y are flat, Z is up.
			if (AXIS_FROM_USER[k]) { applyBrush({ axis: AXIS_FROM_USER[k] }); return; }
			if (k === 'h') { applyBrush({ size: getState().brush.size === 'half' ? 'full' : 'half' }); return; }
			if (k === 'r') { applyBrush({ rounded: !getState().brush.rounded }); return; }
			if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeAtCursor(); return; }
			if (k === 'Enter' && !onButton) { e.preventDefault(); applyBrush({}); }
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
}
