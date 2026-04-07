/**
 * UniversalModal — Single Source of Truth
 *
 * This file is the canonical re-export of the active UniversalModal implementation.
 * Edit @/components/ui/universal-modal to change ALL modals platform-wide.
 *
 * Behavior:
 *   - Desktop → Dialog (Radix UI, centered overlay)
 *   - Mobile  → Sheet  (Radix UI, slides up from bottom)
 *
 * Usage (import from the barrel — one import gets everything):
 *   import { UniversalModal, UniversalModalHeader, UniversalModalTitle,
 *            UniversalModalBody, UniversalModalFooter } from '@/components/universal'
 */
export {
  UniversalModal,
  UniversalModalContent,
  UniversalModalHeader,
  UniversalModalStyledHeader,
  UniversalModalBody,
  UniversalModalFooter,
  UniversalModalTitle,
  UniversalModalDescription,
  UniversalModalClose,
  UniversalModalTrigger,
} from '@/components/ui/universal-modal';
