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
    console.log("Loading Bar: Starting loading bar in element '" +  element + "' with attribute '" +  attribute + "'" + " at interval " + interval + "ms" );

    let index = 0;
    const loadingChars = ["🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤"];

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

/***
 * Convert date to readable format
 * @param {string} dateString - The date string to be converted, i.e. 2025-09-25 21:07:08
 * @param {string} locale - The locale code for formatting, e.g. "en-US" or "de-DE"
 * @returns {string} - The formatted date string.
 */
export function dateFormat(dateString, locale = "en-US", pastTime = true) {
    const date = new Date(dateString);

    if (pastTime === true) {
        const now               = new Date();
        const diffInMs          = now - date;
        const diffInSeconds     = Math.floor(diffInMs / 1000);
        const diffInMinutes     = Math.floor(diffInSeconds / 60);
        const diffInHours       = Math.floor(diffInMinutes / 60);
        const diffInDays        = Math.floor(diffInHours / 24);

        if (diffInDays > 0) {
            const translationKey = diffInDays === 1 ? "DayAgo" : "DaysAgo";
            return window.Translation.get(translationKey).replace("{0}", diffInDays);
        } else if (diffInHours > 0) {
            const translationKey = diffInHours === 1 ? "HourAgo" : "HoursAgo";
            return window.Translation.get(translationKey).replace("{0}", diffInHours);
        } else if (diffInMinutes > 0) {
            const translationKey = diffInMinutes === 1 ? "MinuteAgo" : "MinutesAgo";
            return window.Translation.get(translationKey).replace("{0}", diffInMinutes);
        } else {
            const translationKey = diffInSeconds === 1 ? "SecondAgo" : "SecondsAgo";
            return window.Translation.get(translationKey).replace("{0}", diffInSeconds);
        }
    }
    else {
        return date.toLocaleString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }
}

/**
 * Shows a spinner inside the specified container element.
 * @param {String} containerSelector 
 * @returns {HTMLElement} - The spinner element created.
 */
export function spinnerShow(containerSelector) {
    document.querySelector(containerSelector).innerHTML = "";
    
    const spinner = document.createElement("ion-spinner");
    spinner.name = "dots";
    spinner.color = "warning";

    const center = document.createElement("center");
    center.appendChild(spinner);
    document.querySelector(containerSelector).prepend(center);
    
    return spinner;
}

/**
 * Translates bridge code to human-readable format.
 * @param {String} bridge 
 * @returns {String} - Translated bridge name.
 */
export function bridgeTranslate(bridge) {
    let bridgeInfo = "";
    switch(bridge) {
        case "zigbee":
            bridgeInfo = window.Translation.get("Zigbee");
            break;
        case "bluetooth":
            bridgeInfo = window.Translation.get("Bluetooth");
            break;
        case "http":
            bridgeInfo = window.Translation.get("Wifi");
            break;
        case "lora":
            bridgeInfo = window.Translation.get("LoRa");
            break;
        default:
            bridgeInfo = window.Translation.get("Unknown");
    }
    return bridgeInfo;
}

/**
 * Displays a "no data" message inside the specified container element.
 * @param {String} containerSelector 
 * @return {void}
 */
export function entriesNoDataMessage(containerSelector) {
    document.querySelector(containerSelector).innerHTML = `
        <div class="no-data-container">
            <br />
            <ion-text><center>${window.Translation.get("EntriesNone")}</center></ion-text>
            <br />
            <ion-text><center>${window.Translation.get("EntriesNoneAddNew")}</center></ion-text> 
            <br />
            <center><ion-img class="image-arrow" src="./assets/backgrounds/arrow.svg"></ion-img></center>
        </div>
      `;
}