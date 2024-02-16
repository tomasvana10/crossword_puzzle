/* `interaction.js` implements various functions allow the crossword grid to be interacted with by the user. 
Additionally, this script offers automatic detection of crossword completion, and relays this information to the user. 
*/

let grid, dimensions, empty, colour_palette, intersections; // Jinja2 template variables
let direction = "ACROSS",
    currentWord = null,
    cellCoords = null,
    staticIndex = null,
    isDown = null,
    defItems = null,
    defIndex = 0;
const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
const spacebarKeys = ["Spacebar", " "];

/* Functions for conditional checks and other minor utilities */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const isEmpty = (cell) => !cell?.childNodes[0]?.nodeValue;
const setFocusMode = (bool) => { if (cellCoords !== null) { changeWordFocus(bool); changeCellFocus(bool); changeDefinitionsListItemFocus(bool); } }
const setValue = (cell, value) => cell.childNodes[0].nodeValue = value; // Using nodes prevents any `num_label` elements from being deleted
const getCellElement = (coords) => document.querySelector(`[data-row="${coords[0]}"][data-column="${coords[1]}"]`);
const updateCellCoords = (cell) => [parseInt(cell.getAttribute("data-row")), parseInt(cell.getAttribute("data-column"))]; 
const shouldDirectionBeAlternated = (coords) => shiftCellCoords(coords, direction, "enter").isEqualTo(coords) && shiftCellCoords(coords, direction, "del").isEqualTo(coords); 
const changeCellFocus = (focus) => { getCellElement(cellCoords).style.backgroundColor = focus ? colour_palette.CELL_FOCUS : colour_palette.SUB; };
const getDefinitionsListItemFromWord = () => document.querySelector(`[data-word="${currentWord}"]`);
const changeDefinitionsListItemFocus = (focus) => getDefinitionsListItemFromWord().style.backgroundColor = focus ? colour_palette.WORD_FOCUS : ""; 
const alternateDirection = () => direction = direction === "ACROSS" ? "DOWN" : "ACROSS";
const isCrosswordComplete = () => getGrid().isEqualTo(grid);

Array.prototype.isEqualTo = function(arr) { return JSON.stringify(this) === JSON.stringify(arr); };


document.addEventListener("DOMContentLoaded", () => { // On page load
    const body = document.querySelector("body");

    grid = eval(body.getAttribute("data-grid")); /* Convert Python array to JS array */
    dimensions = parseInt(body.getAttribute("data-dimensions"));
    empty = body.getAttribute("data-empty");
    colour_palette = JSON.parse(body.getAttribute("data-colour_palette"));
    intersections = JSON.stringify(eval(body.getAttribute("data-intersections")));

    defItems = document.querySelectorAll(".def");

    // Reset all non-empty cells to empty strings (issue with HTML)
    document.querySelectorAll(".non_empty_cell").forEach(cell => setValue(cell, "")); 
});


document.addEventListener("keydown", (event) => {
    /* Handle user input - either set the value of the current cell to the user's input (if valid),
    perform cell deletion, or perform special tasks: remove the word/cell focus entirely, alternate
    direction at an intersection, or move the focus according to the arrow keys a user presses. */
    let inputValue = event.key;

    // Accessibility related input detection relating to tab and tabindex. 
    if (inputValue === "Enter" && !popupToggled) { event.target.click(); return; } // Select word

    if (cellCoords === null) { return; } // User hasn't selected a cell, so normal/special inputs cannot be performed

    // Special inputs
    if (arrowKeys.includes(inputValue)) { handleArrowPress(inputValue, event); return; }
    if (inputValue === "Escape") { handleEscapePress(event); return; }
    if (intersections.includes(JSON.stringify(cellCoords)) && spacebarKeys.includes(inputValue)) { handleSpacebarPress(event); return; }

    // Normal inputs
    let mode = (inputValue === "Backspace" || inputValue === "Delete") ? "del" : "enter";
    let currentCell = getCellElement(cellCoords);

    if (mode === "enter") {
        if (!(inputValue.length === 1 && (inputValue.match(/\p{L}/u)))) { return; } // Regex matches `letter` characters
        setValue(currentCell, inputValue);
    } else if (mode === "del") {
        if (!isEmpty(currentCell)) { setValue(currentCell, ""); return; } // Focused cell has content, just delete it
        setValue(getCellElement(shiftCellCoords(cellCoords, direction, mode)), ""); // Perform standard deletion
    }
    
    if (isCrosswordComplete()) { sleep(1).then(() => { document.dispatchEvent(new KeyboardEvent("keydown", {"key": "Escape"})); 
                                                       toggleCompletionPopup(); }) }
    
    changeCellFocus(false);
    cellCoords = shiftCellCoords(cellCoords, direction, mode);
    changeWordFocus(true); changeCellFocus(true);
});

function handleSpacebarPress(event) {
    /* Alternate direction when pressing the spacebar at an intersection. */    
    event.preventDefault();
    setFocusMode(false);
    alternateDirection();
    currentWord = updateCurrentWord();
    setFocusMode(true);
}

function handleEscapePress(event) { 
    /* Remove focus from everything. */
    event.preventDefault();
    setFocusMode(false);
    cellCoords = null; currentWord = null;
}

function handleArrowPress(key, event) {
    /* Determine how the program responds to the user pressing an arrow. First, see if a "enter" or
    "del" shift is performed and in what direction. Then, ensure the user is not shifting into a
    `.empty` cell. Finally, alternate the direction if necessary and refocus. */
    event.preventDefault();
    let mode = (key === "ArrowDown" || key === "ArrowRight") ? "enter" : "del";
    let dir = (key === "ArrowDown" || key === "ArrowUp") ? "DOWN" : "ACROSS";
    let newCellCoords = shiftCellCoords(cellCoords, dir, mode, true);
    let skipFlag = false;

    // Attempt to find an unfilled cell in the direction of the arrow press (if shifting into an empty cell)
    try {
        while (getCellElement(newCellCoords).classList.contains("empty_cell")) {
            newCellCoords = shiftCellCoords(newCellCoords, dir, mode, true);
            skipFlag = true;
        }
    } catch(err) { newCellCoords = cellCoords; } // Couldn't find any unfilled cells

    setFocusMode(false);
    // If moving perpendicular to an intersection, only alternate the direction and retain the prior `cellCoords`
    if (shouldDirectionBeAlternated(newCellCoords)) { 
        alternateDirection();
        // Cells were skipped to reach these new coordinates, so update `cellCoords`
        if (skipFlag) { cellCoords = newCellCoords; }
        skipFlag = false;
    } else { cellCoords = newCellCoords; }
    currentWord = updateCurrentWord();
    setFocusMode(true);
}

function shiftCellCoords(coords, dir, mode, force=false) {
    /* Move the input forward or backward based on the `mode` parameter. If no such cell exists at
    these future coordinates (and the force param is false), the original coordinates are returned. */
    let offset = (mode == "enter") ? 1 : -1;
    let newCellCoords = (dir == "DOWN") ? [coords[0] + offset, coords[1]] : [coords[0], coords[1] + offset];
    let newCell = getCellElement(newCellCoords);

    return newCell !== null && newCell.classList.contains("non_empty_cell") || force
           // The following comments only apply if `force` is false
           ? newCellCoords // Cell at future coords is a non empty cell
           : coords; // Cell at future coords is empty/black, cannot move to it
}

function onDefinitionsListItemClick(numLabel, dir) {
    /* Set user input to the start of a word when they click its definition/clue. */
    setFocusMode(false);

    // Get new cell element from parent of the number label
    let cell = document.querySelector(`[data-num_label="${numLabel}"]`).parentElement;
    direction = dir;
    cellCoords = updateCellCoords(cell);
    currentWord = updateCurrentWord();
    setFocusMode(true);
}

function onCellClick(cell) {
    /* Handles how the grid responds to a user clicking on the cell. Ensures the appropriate display
    of the current cell and word focus on cell click, as well as alternating input directions if
    clicking at an intersecting point between two words. */
    setFocusMode(false); 

    let newCellCoords = updateCellCoords(cell);
    // User is clicking on an intersection for the second time, so alternate the direction
    if (intersections.includes(JSON.stringify(newCellCoords)) && newCellCoords.isEqualTo(cellCoords)) 
        alternateDirection();

    // Cannot shift the cell in the original direction, so it must be alternated
    else if (shouldDirectionBeAlternated(newCellCoords))
        alternateDirection();
        
    cellCoords = newCellCoords;
    currentWord = updateCurrentWord();
    setFocusMode(true);
}

function changeWordFocus(focus) {
    /* Retrieve the starting and ending coordinates of a word and change the colour of the cell elements
    that make up that word to a different colour. */
    let [startCoords, endCoords] = getWordIndices();
    for (let i = startCoords; i <= endCoords; i++) {
        let coords = isDown ? [i, staticIndex] : [staticIndex, i];
        getCellElement(coords).style.backgroundColor = focus ? colour_palette.WORD_FOCUS : colour_palette.SUB;
    }
}

function updateCurrentWord() {
    /* Return the current word in uppercase using `getWordIndices` */
    let word = "";
    let [startCoords, endCoords] = getWordIndices();
    for (let i = startCoords; i <= endCoords; i++) {
        let coords = isDown ? [i, staticIndex] : [staticIndex, i];
        word += getCellElement(coords).getAttribute("data-value");
    }

    return word.toUpperCase();
}

function getWordIndices() {
    /* Iterate either across or down through the grid to find the starting and ending indices of a word. */
    let [row, col] = cellCoords;
    isDown = direction === "DOWN";
    staticIndex = isDown ? col : row;
    let [startCoords, endCoords] = isDown ? [row, row] : [col, col];

    // Find starting coords of the word
    while (startCoords > 0 && grid[isDown ? startCoords - 1 : row][isDown ? col : startCoords - 1] != empty)
        startCoords--;

    // Find ending coords of the word
    while (endCoords < dimensions - 1 && grid[isDown ? endCoords + 1 : row][isDown ? col : endCoords + 1] != empty) 
        endCoords++;

    return [startCoords, endCoords];
}

function getGrid() {
    /* Create an empty replica of the crossword grid, then update it according to the web app grid */
    let webAppGrid = Array.from({ length: dimensions }, () => Array(dimensions).fill(empty));

    document.querySelectorAll(".non_empty_cell").forEach((cell) => {
        let row = parseInt(cell.getAttribute("data-row"));
        let column = parseInt(cell.getAttribute("data-column"));
        let value = cell.childNodes[0].nodeValue.toUpperCase();
        webAppGrid[row][column] = value;
    });

    return webAppGrid;
}