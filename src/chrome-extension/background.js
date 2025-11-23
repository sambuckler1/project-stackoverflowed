chrome.runtime.onInstalled.addListener(() => {
    console.log("FBAlgo Shopper installed");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "OPEN_LOGIN") {
      chrome.windows.create({
        url: chrome.runtime.getURL("login.html"),
        type: "popup",
        width: 420,
        height: 620
      });
    }
  });
  