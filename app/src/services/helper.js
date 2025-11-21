/**
 * =============================================================================================
 * Helper service
 * ==============

/**
 * Starts a loading bar animation in the specified element.
 * @param {string} element - The selector of the element where the loading animation will be displayed.
 * @param {number} interval - The interval in milliseconds for updating the loading animation.
 * @returns {number} - The interval ID that can be used to stop the loading animation. 
 */
export function barLoadingStart(element, attribute="textContent", interval = 200) {
    const elementDOM = document.querySelector(element);
    console.log("Starting loading bar in element '" +  element + "' with attribute '" +  attribute + "'" + " at interval " + interval + "ms" );

    let index = 0;
    const loadingChars = ["🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤","🩶","🤍"];

    elementDOM[attribute] = loadingChars[index];
    const loadingInterval = setInterval(() => {
        index = (index + 1) % loadingChars.length;
        elementDOM[attribute] = loadingChars[index];
    }, interval);

    return loadingInterval;
}

/** * Stops the loading bar animation in the specified element.
 * @param {number} loadingInterval - The interval ID returned by barLoadingStart.
 * @param {string} element - The selector of the element where the loading animation was displayed.
 */
export function barLoadingStop(loadingInterval, element, attribute="textContent") {
    clearInterval(loadingInterval);
    const elementDOM = document.querySelector(element);
    elementDOM[attribute] = "";
}