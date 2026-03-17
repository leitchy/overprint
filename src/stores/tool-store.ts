import { create } from 'zustand';
import type { SpecialItemId } from '@/utils/id';
import type { SpecialItemType } from '@/core/models/types';

export type Tool =
  | { type: 'pan' }
  | { type: 'addControl' }
  | { type: 'addSpecialItem'; itemType: SpecialItemType };

interface ToolState {
  activeTool: Tool;
  descriptionsPanelOpen: boolean;
  selectedSpecialItemId: SpecialItemId | null;
}

interface ToolActions {
  setTool: (tool: Tool) => void;
  toggleDescriptionsPanel: () => void;
  setDescriptionsPanelOpen: (open: boolean) => void;
  setSelectedSpecialItem: (id: SpecialItemId | null) => void;
}

export const useToolStore = create<ToolState & ToolActions>()((set) => ({
  activeTool: { type: 'pan' },
  descriptionsPanelOpen: false,
  selectedSpecialItemId: null,

  setTool: (tool) => {
    set({ activeTool: tool });
  },

  toggleDescriptionsPanel: () => {
    set((state) => ({ descriptionsPanelOpen: !state.descriptionsPanelOpen }));
  },

  setDescriptionsPanelOpen: (open) => {
    set({ descriptionsPanelOpen: open });
  },

  setSelectedSpecialItem: (id) => {
    set({ selectedSpecialItemId: id });
  },
}));
