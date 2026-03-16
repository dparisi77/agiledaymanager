// Import Firebase SDK modules (ES6)
import * as FirebaseService from "./js/firebase.js";

// Load other modules for side effects (still using IIFE pattern)
import "./js/utils.js";
import "./js/auth.js";
import "./js/dashboard.js";
import "./js/app.js";

// Make Firebase service available globally for compatibility
window.FirebaseService = FirebaseService;

// Wire login/app shell visibility to auth state
document.addEventListener("DOMContentLoaded", () => {
  Auth.onAuthChange((session) => {
    const loginView = document.getElementById("loginView");
    const appShell = document.getElementById("appShell");
    if (session) {
      loginView?.classList.add("d-none");
      appShell?.classList.remove("d-none");

      // Pre-fill setup form if saved or if config file is available
      if (FirebaseService.hasSavedConfig()) {
        FirebaseService.prefillFormFromStorage();
        document.getElementById("setupSavedBtn")?.classList.remove("d-none");
      } else if (
        typeof FIREBASE_CONFIG !== "undefined" &&
        FIREBASE_CONFIG.projectId
      ) {
        FirebaseService.prefillFormFromFile();
      }
    } else {
      loginView?.classList.remove("d-none");
      appShell?.classList.add("d-none");
    }
  });

  // Initialize app
  if (App.init && typeof App.init === "function") {
    App.init();
  }
});
