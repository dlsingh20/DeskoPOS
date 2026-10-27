import { useEffect } from 'react';
import { usePOS } from '../context/POSContext';

/**
 * Custom hook for managing modal state with auto-refresh pause
 * Automatically pauses auto-refresh when modal opens and resumes when closed
 * 
 * @param {boolean} isOpen - Whether the modal is currently open
 * @param {string} modalName - Unique identifier for the modal
 */
export const useModal = (isOpen, modalName) => {
  const { setActiveModal, clearActiveModal } = usePOS();

  useEffect(() => {
    if (isOpen) {
      console.log(`Modal opened: ${modalName} - Auto-refresh paused`);
      setActiveModal(modalName);
    } else {
      console.log(`Modal closed: ${modalName} - Auto-refresh resumed`);
      clearActiveModal();
    }

    // Cleanup: always clear modal on unmount
    return () => {
      if (isOpen) {
        clearActiveModal();
      }
    };
  }, [isOpen, modalName, setActiveModal, clearActiveModal]);
};

/**
 * Hook variant that returns modal control functions
 * Combines useDisclosure-like functionality with auto-refresh pause
 * 
 * @param {string} modalName - Unique identifier for the modal
 * @returns {Object} Modal control functions and state
 */
export const useModalWithPause = (modalName) => {
  const { setActiveModal, clearActiveModal } = usePOS();

  const onOpen = () => {
    console.log(`Modal opened: ${modalName} - Auto-refresh paused`);
    setActiveModal(modalName);
  };

  const onClose = () => {
    console.log(`Modal closed: ${modalName} - Auto-refresh resumed`);
    clearActiveModal();
  };

  return {
    onOpen,
    onClose,
  };
};