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
      title: 'Import from PurplePen',
      body:
        'Already have courses in PurplePen? Use File \u2192 Open from PurplePen to import a .ppen file, ' +
        'or drag and drop it onto the canvas. All courses, controls, descriptions, leg bend points, and ' +
        'embedded images are imported. For best results, load the map file first (OCAD or OMAP), then ' +
        'import the .ppen \u2014 controls will be placed accurately on the map. You can also drop both ' +
        'files together. Use the eye icons in the course list to toggle which courses are visible.',
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
      title: 'Variations and relays',
      body:
        'Open the Variations section in the course panel to add forks (gaffling) or butterfly/phi ' +
        'loops on a normal course. A fork sends runners down one of several branches that rejoin ' +
        'further along; a loop set sends them around a central hub in different orders. Overprint ' +
        'enumerates every variation automatically and exports each one \u2014 map, descriptions, and ' +
        'IOF XML. For relays, use the "Relay teams\u2026" button to assign scrambled, anti-following ' +
        'variations across teams and legs, then export the grid as IOF XML or a PDF table.',
    },
    {
      title: 'Place controls with GPS',
      body:
        'On a phone or tablet you can place controls at your real-world position. With a ' +
        'georeferenced map (OCAD and OMAP carry this automatically \u2014 otherwise calibrate against ' +
        'two known points), enable GPS from the toolbar. Then, with the Add Control tool active and ' +
        'a GPS fix, press G (or tap "Place at GPS position") to drop a control where you are ' +
        'standing. Auto-follow keeps the map centred on you as you move.',
    },
    {
      title: 'Add special items',
      body:
        'The Insert menu adds non-control features to the map: text labels, lines, marked routes, ' +
        'and description boxes, plus IOF symbols such as out-of-bounds, dangerous area, water, ' +
        'first aid, and forbidden route. Text and rectangles default to black; overprint symbols ' +
        'default to purple. Select any item to move, edit, or recolour it.',
    },
    {
      title: 'Check your event before printing',
      body:
        'Run Event Audit (in the menu) to catch problems before you print: missing descriptions, ' +
        'duplicate control codes, unusually short or long legs, unused controls, and unbalanced ' +
        'butterfly loops. Fix the flagged items and the audit confirms when the event is ready to print.',
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
