/**
 * =============================================================================================
 * Toast service
 * =============
 */

/**
 * Function to present a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of the toast (e.g., "success", "error")
 * @param {object} toastController - The toast controller instance
 * @return {Promise<void>}
 */
export async function toastShow(message, type="success") {
    const toast = await window.toastController.create({
      message: message,
      duration: window.appConfig.CONF_toastDuration,
      color: type,
    });

    await toast.present();
  }