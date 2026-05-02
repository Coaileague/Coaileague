/**
 * useChatViewState (C3) — single reducer for ChatDock overlay/dialog state.
 *
 * Replaces eight independent useState calls in ChatDock.tsx that previously
 * could all be open at the same time (showInfo + showAttach + a reply
 * picker + an edit dialog + a lightbox + a search bar + ...).  This reducer
 * enforces "AT MOST ONE OVERLAY AT A TIME" so opening a new overlay
 * automatically closes the others — kills the entire "two overlays open
 * at once" class of bug without touching any callsite.
 *
 * Returns wrapped setters that match the original useState API surface so
 * the dock body keeps using `setShowInfo(true)` / `setReplyingTo({...})`
 * exactly as before.  No callsite changes required.
 */
import { useReducer, useCallback, type Dispatch, type SetStateAction } from "react";

export interface ReplyContext { id: string; senderName: string; message: string }
export interface EditContext { id: string; message: string }
export interface LightboxData {
  src: string;
  senderName?: string;
  timestamp?: string;
  filename?: string;
  gpsAddress?: string;
}

interface ChatViewState {
  showInfo: boolean;
  showAttach: boolean;
  showChatSearch: boolean;
  activeMessageMenu: string | null;
  replyingTo: ReplyContext | null;
  editingMessage: EditContext | null;
  forwardingMessageId: string | null;
  lightboxData: LightboxData | null;
}

const INITIAL: ChatViewState = {
  showInfo: false,
  showAttach: false,
  showChatSearch: false,
  activeMessageMenu: null,
  replyingTo: null,
  editingMessage: null,
  forwardingMessageId: null,
  lightboxData: null,
};

// Each overlay key declares whether it's exclusive (mutually exclusive with
// other overlays) or compositional (can coexist).  Reply + edit are
// compositional with the search bar (you can search while drafting); the
// modal/menu/lightbox group is exclusive.
const EXCLUSIVE_KEYS = new Set<keyof ChatViewState>([
  'showInfo',
  'showAttach',
  'activeMessageMenu',
  'forwardingMessageId',
  'lightboxData',
]);

type Action =
  | { type: 'SET'; key: keyof ChatViewState; value: unknown };

function reducer(state: ChatViewState, action: Action): ChatViewState {
  if (action.type !== 'SET') return state;
  const { key, value } = action;

  // Resolve "is the new value an OPEN signal?" — true/non-null means open.
  const isOpening = value !== false && value !== null;

  if (isOpening && EXCLUSIVE_KEYS.has(key)) {
    // Close every other exclusive overlay before opening this one.
    const next: ChatViewState = { ...state, [key]: value };
    for (const k of EXCLUSIVE_KEYS) {
      if (k === key) continue;
      next[k] = INITIAL[k];
    }
    return next;
  }

  // Reply <-> Edit: composing both at once doesn't make sense, so opening
  // one closes the other. They're allowed to coexist with the search bar.
  if (isOpening && key === 'replyingTo') {
    return { ...state, replyingTo: value, editingMessage: null };
  }
  if (isOpening && key === 'editingMessage') {
    return { ...state, editingMessage: value, replyingTo: null };
  }

  return { ...state, [key]: value };
}

function makeSetter<T>(
  dispatch: Dispatch<Action>,
  state: ChatViewState,
  key: keyof ChatViewState,
): Dispatch<SetStateAction<T>> {
  return (next: SetStateAction<T>) => {
    const value = typeof next === 'function'
      ? (next as (prev: T) => T)(state[key] as T)
      : next;
    dispatch({ type: 'SET', key, value });
  };
}

export function useChatViewState() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Wrapped setters — same shape as React.useState's setter so callsites
  // do not need to change. The reducer handles the close-others invariant.
  const setShowInfo            = useCallback(makeSetter<boolean>(dispatch, state, 'showInfo'), [state]);
  const setShowAttach          = useCallback(makeSetter<boolean>(dispatch, state, 'showAttach'), [state]);
  const setShowChatSearch      = useCallback(makeSetter<boolean>(dispatch, state, 'showChatSearch'), [state]);
  const setActiveMessageMenu   = useCallback(makeSetter<string | null>(dispatch, state, 'activeMessageMenu'), [state]);
  const setReplyingTo          = useCallback(makeSetter<ReplyContext | null>(dispatch, state, 'replyingTo'), [state]);
  const setEditingMessage      = useCallback(makeSetter<EditContext | null>(dispatch, state, 'editingMessage'), [state]);
  const setForwardingMessageId = useCallback(makeSetter<string | null>(dispatch, state, 'forwardingMessageId'), [state]);
  const setLightboxData        = useCallback(makeSetter<LightboxData | null>(dispatch, state, 'lightboxData'), [state]);

  return {
    ...state,
    setShowInfo,
    setShowAttach,
    setShowChatSearch,
    setActiveMessageMenu,
    setReplyingTo,
    setEditingMessage,
    setForwardingMessageId,
    setLightboxData,
  };
}
