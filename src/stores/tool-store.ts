import { create } from 'zustand';
import type { CourseId, SpecialItemId } from '@/utils/id';
import type { SpecialItemType } from '@/core/models/types';

export type Tool =
  | { type: 'pan' }
  | { type: 'addControl' }
  | { type: 'addSpecialItem'; itemType: SpecialItemType; lineStyle?: 'solid' | 'dashed' }
  | { type: 'setPrintArea' }
  | { type: 'calibrate' }
  | { type: 'moveAll' };

export type MobilePanel = 'none' | 'course' | 'descriptions' | 'menu';

interface ToolState {
  activeTool: Tool;
  descriptionsPanelOpen: boolean;
  shortcutsModalOpen: boolean;
  gettingStartedOpen: boolean;
  /** Getting Started section to open/scroll to, or null for the default (first) section. */
  gettingStartedSection: string | null;
  selectedSpecialItemId: SpecialItemId | null;
  /** When non-null, the text item is being edited inline on the canvas */
  editingTextItemId: SpecialItemId | null;
  /** On mobile/tablet, only one panel can be open at a time */
  mobilePanelOpen: MobilePanel;
  /** Course whose Relay-teams modal is open (E10 Phase 3), or null when closed. */
  relayModalCourseId: CourseId | null;
}

interface ToolActions {
  setTool: (tool: Tool) => void;
  toggleDescriptionsPanel: () => void;
  setDescriptionsPanelOpen: (open: boolean) => void;
  toggleShortcutsModal: () => void;
  toggleGettingStarted: () => void;
  /** Open the Getting Started drawer at a specific section (used by contextual help buttons). */
  openGettingStarted: (sectionId?: string | null) => void;
  setSelectedSpecialItem: (id: SpecialItemId | null) => void;
  setEditingTextItemId: (id: SpecialItemId | null) => void;
  setMobilePanelOpen: (panel: MobilePanel) => void;
  toggleMobilePanel: (panel: Exclude<MobilePanel, 'none'>) => void;
  setRelayModalCourseId: (id: CourseId | null) => void;
}

export const useToolStore = create<ToolState & ToolActions>()((set) => ({
  activeTool: { type: 'pan' },
  descriptionsPanelOpen: false,
  shortcutsModalOpen: false,
  gettingStartedOpen: false,
  gettingStartedSection: null,
  selectedSpecialItemId: null,
  editingTextItemId: null,
  mobilePanelOpen: 'none',
  relayModalCourseId: null,

  setTool: (tool) => {
    set({ activeTool: tool });
  },

  toggleDescriptionsPanel: () => {
    set((state) => ({ descriptionsPanelOpen: !state.descriptionsPanelOpen }));
  },

  setDescriptionsPanelOpen: (open) => {
    set({ descriptionsPanelOpen: open });
  },

  toggleShortcutsModal: () => {
    set((state) => ({ shortcutsModalOpen: !state.shortcutsModalOpen }));
  },

  toggleGettingStarted: () => {
    set((state) => ({
      gettingStartedOpen: !state.gettingStartedOpen,
      gettingStartedSection: null, // opening from the Help menu → default (first) section
    }));
  },

  openGettingStarted: (sectionId = null) => {
    set({ gettingStartedOpen: true, gettingStartedSection: sectionId });
  },

  setSelectedSpecialItem: (id) => {
    set({ selectedSpecialItemId: id });
  },

  setEditingTextItemId: (id) => {
    set({ editingTextItemId: id });
  },

  setMobilePanelOpen: (panel) => {
    set({ mobilePanelOpen: panel });
  },

  toggleMobilePanel: (panel) => {
    set((state) => ({
      mobilePanelOpen: state.mobilePanelOpen === panel ? 'none' : panel,
    }));
  },

  setRelayModalCourseId: (id) => {
    set({ relayModalCourseId: id });
  },
}));
