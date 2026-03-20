/**
 * Getting Started guide content — English (source of truth).
 *
 * Other languages can provide their own file exporting the same interface.
 * Falls back to English when a translation is not available.
 */

export interface HelpSection {
  title: string;
  body: string;
}

export interface HelpContent {
  sections: HelpSection[];
}

export const helpContent: HelpContent = {
  sections: [
    {
      title: 'Load your map',
      body:
        'Drag a map file onto the canvas, or use File \u2192 Load Map. ' +
        'Supported formats: PNG, JPEG, GIF, TIFF, BMP, PDF, OCAD (.ocd), and OpenOrienteering Mapper (.omap, .xmap). ' +
        'After loading, set the correct map scale in the Map Settings panel that appears below the toolbar.',
    },
    {
      title: 'Set up courses',
      body:
        'Create a course using the "Add course" button in the course panel (bottom-left). ' +
        'Switch between courses using the tabs at the top of the panel. ' +
        'The "All Controls" view shows every control placed on the map across all courses. ' +
        'Controls are shared \u2014 the same control can appear in multiple courses.',
    },
    {
      title: 'Place controls',
      body:
        'Select the Add Control tool from the toolbar or the Insert menu (shortcut: A). ' +
        'Click on the map to place a start triangle, controls, and finish circle. ' +
        'A dashed line follows your cursor showing where the next leg will go. ' +
        'Drag controls to reposition them. Click on a leg to insert a new control between two existing ones. ' +
        'Fill in IOF description columns using the Descriptions panel (shortcut: D).',
    },
    {
      title: 'Export',
      body:
        'Use File \u2192 Export PDF to generate course maps and description sheets for printing. ' +
        'You can export a single course, all courses in one PDF, or each course as a separate file. ' +
        'Export IOF XML for electronic punching and results software. ' +
        'PNG and JPEG image exports are also available.',
    },
  ],
};
