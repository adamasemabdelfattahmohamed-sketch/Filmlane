/**
 * Screenplay formatting rules
 * Defines the business logic for screenplay element transitions
 */

/**
 * Determines the next format when Tab key is pressed
 * @param currentFormat - The current format type (e.g., 'action', 'character', 'dialogue')
 * @param isEmpty - Whether the current element is empty
 * @param shiftPressed - Whether Shift key is held (for reverse navigation)
 * @returns The next format type
 */
export const getNextFormatOnTab = (
  currentFormat: string,
  _isEmpty = false,
  shiftPressed = false
): string => {
  // خريطة الخيارات المتاحة لكل format عند الضغط على Tab
  const tabOptions: { [key: string]: string[] } = {
    dialogue: ["action", "character", "transition"], // 3 خيارات
    action: ["action", "character", "transition"], // 3 خيارات
    character: ["dialogue"], // dialogue فقط
    parenthetical: ["dialogue"], // dialogue فقط
    transition: ["scene-header-1"],
    basmala: ["scene-header-1"],
    "scene-header-1": ["scene-header-2"],
    "scene-header-2": ["scene-header-3"],
    "scene-header-top-line": ["scene-header-3"],
    "scene-header-3": ["action"],
  };

  const options = tabOptions[currentFormat];
  if (!options || options.length === 0) return currentFormat;

  if (options.length === 1) {
    return options[0];
  }

  // إذا كان هناك خيارات متعددة
  if (shiftPressed) {
    // Shift+Tab للخيار السابق
    return options[options.length - 1];
  } else {
    // Tab للخيار التالي
    return options[0];
  }
};

/**
 * Determines the next format when Enter key is pressed
 * @param currentFormat - The current format type
 * @returns The next format type after pressing Enter
 */
export const getNextFormatOnEnter = (currentFormat: string): string => {
  const transitions: { [key: string]: string } = {
    basmala: "scene-header-1",
    "scene-header-1": "scene-header-2", // scene-header-1 → scene-header-2
    "scene-header-2": "scene-header-3", // scene-header-2 → scene-header-3
    "scene-header-top-line": "scene-header-3", // scene-header-top-line → scene-header-3
    "scene-header-3": "action", // scene-header-3 → action
    character: "dialogue", // character → dialogue فقط
    parenthetical: "dialogue", // parenthetical → dialogue
    dialogue: "action", // dialogue الخيار الأول: action
    action: "action", // action الخيار الأول: action
    transition: "scene-header-1", // transition → scene-header-1
  };
  return transitions[currentFormat] || "action";
};
