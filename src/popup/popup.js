// Renews an account's access token via background.js (silent re-auth, no client secret).
// Returns the new token, or null if the user has to sign in again.
async function refreshAccessToken(email) {
    try {
        const { token } = await chrome.runtime.sendMessage({ type: "renew-token", email });
        return token || null;
    } catch (err) {
        console.error("Fejl ved refreshAccessToken:", err);
        return null;
    }
}

let isFetching = false; 
let nextPageTokensByAccount = {};

let emailViewMode = "html"; // "html" eller "text"


function toggleEmailViewMode() {
emailViewMode = emailViewMode === "html" ? "text" : "html";
console.log("Email view mode switched to:", emailViewMode);


// Hvis en mail allerede er åben, genindlæs den med ny visning
const iframe = document.getElementById("email-body-iframe");
if (iframe) {
    const bodyContent = getEmailBody(payload, emailViewMode); // 👈 vigtigt
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: sans-serif; padding: 1em; color: #333; }
                img { max-width: 100%; height: auto; display: block; margin: 1em 0; }
                a { color: ${color}; text-decoration: underline; }
            </style>
        </head>
        <body>${bodyContent || "<p>Couldn't load e-mail content.</p>"}</body>
        </html>`;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
}
}

document.addEventListener("DOMContentLoaded", function () {
    const searchContainer = document.createElement("div");
        searchContainer.id = "search-container";
        searchContainer.style.display = "flex";
        searchContainer.style.gap = "0.5em";
        searchContainer.style.alignItems = "center";
        searchContainer.style.backgroundColor = "#fff";
        searchContainer.style.marginLeft = "10px";
        searchContainer.innerHTML = `
        <input
            type="text"
            id="search-input"
            placeholder="Search through emails..."
            style="
                flex: 1;
                padding: 0.5em;
                border: none;
                outline: none;
                background: #f0f0f0;
                border-radius: 4px;
                font-size: 14px;
            "
        />
        <button
            id="search-button"
            style="
                padding: 0.5em 0.75em;
                border: none;
                background: #fff;
                color: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            "
        >
            🔍
        </button>
        <button
            id="clear-search"
            style="
                padding: 0.5em 0.75em;
                border: none;
                background: #fff;
                color: #333;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            "
        >
            ❌
        </button>
    `;
    const header = document.getElementById("header");
    header.parentNode.insertBefore(searchContainer, header.nextSibling);
    const mailbox = document.getElementById("mailbox");
    const emailContent = document.getElementById("email-content");
    const loadMoreButton = document.getElementById("loadMoreButton");
    const settingsContent = document.getElementById("settings-content");
    const settingsButton = document.getElementById("settings-icon");
    const backToMailboxButton = document.getElementById("back-to-mailbox");
    const sentEmailsButton = document.getElementById("Sent-emails");
    const inboxButton = document.getElementById("inbox-button");

    const accountSection = document.createElement("div");
    accountSection.id = "account-section";
    accountSection.style.marginTop = "20px";
  
    const accountTitle = document.createElement("h2");
    accountTitle.textContent = "Mail accounts";
    accountTitle.style.fontSize = "16px";
    accountTitle.style.marginBottom = "10px";
    accountSection.appendChild(accountTitle);
  
    const accountList = document.createElement("ul");
    accountList.id = "account-list";
    accountList.style.listStyle = "none";
    accountList.style.padding = "0";
    accountSection.appendChild(accountList);
  
    const addAccountButton = document.createElement("button");
    addAccountButton.id = "add-account-button";
    addAccountButton.textContent = "Add another account";
    addAccountButton.style.marginTop = "10px";
    addAccountButton.style.padding = "8px 16px";
    addAccountButton.style.border = "none";
    addAccountButton.style.borderRadius = "5px";
    addAccountButton.style.backgroundColor = "#12446c";
    addAccountButton.style.color = "white";
    addAccountButton.style.cursor = "pointer";
    addAccountButton.style.fontWeight = "bold";
    accountSection.appendChild(addAccountButton);
  
    settingsContent.appendChild(accountSection);

    const colorPickerContainer = document.createElement("div");
    colorPickerContainer.id = "color-picker-container";
    colorPickerContainer.style.marginTop = "20px";

    const colorPickerTitle = document.createElement("h2");
    colorPickerTitle.textContent = "Pick your favorite color";
    colorPickerTitle.style.fontSize = "16px";
    colorPickerTitle.style.marginBottom = "10px";
    colorPickerContainer.appendChild(colorPickerTitle);

    const colorPicker = document.createElement("div");
    colorPicker.id = "color-picker";
    colorPicker.style.display = "flex";
    colorPicker.style.flexWrap = "wrap";
    colorPicker.style.gap = "5px";
    colorPicker.style.marginTop = "10px";
    colorPickerContainer.appendChild(colorPicker);

    settingsContent.appendChild(colorPickerContainer);

    renderAccountList();
    const lastOpened = sessionStorage.getItem("lastPopupOpen");
    const now = Date.now();
    
    if (!lastOpened || now - parseInt(lastOpened, 10) > 60 * 1000) {
        fetchAllAccountsEmails(true); // 🔄 hent frisk hvis det er længe siden
    } else {
        fetchAllAccountsEmails();     // ⚡ ellers brug cache
    }
    
    sessionStorage.setItem("lastPopupOpen", now);
    setupColorPicker();
    
    addAccountButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "start-oauth" });
      });
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "account-added") {
            console.log("Modtaget 'account-added' besked. Opdaterer UI...");
            renderAccountList();
            fetchAllAccountsEmails();
        }
    });
  
    function renderAccountList() {
      chrome.storage.local.get("accounts", ({ accounts }) => {
        accountList.innerHTML = "";
        if (!accounts || accounts.length === 0) {
          const li = document.createElement("li");
          li.textContent = "No account addded yet.";
          li.style.color = "#555";
          accountList.appendChild(li);
          return;
        }
        accounts.forEach((account, index) => {
          const li = document.createElement("li");
          li.style.display = "flex";
          li.style.justifyContent = "space-between";
          li.style.alignItems = "center";
          li.style.marginBottom = "8px";
          li.style.background = "#f5f5f5";
          li.style.padding = "8px";
          li.style.borderRadius = "4px";
  
          li.textContent = account.email || `Konto ${index + 1}`;
  
          const removeBtn = document.createElement("button");
          removeBtn.textContent = "🗑️";
          removeBtn.style.border = "none";
          removeBtn.style.background = "none";
          removeBtn.style.cursor = "pointer";
          removeBtn.style.fontSize = "16px";
          removeBtn.title = "Remove this account";
  
          removeBtn.addEventListener("click", () => {
            accounts.splice(index, 1);
            chrome.storage.local.set({ accounts }, renderAccountList);
          });
  
          li.appendChild(removeBtn);
          accountList.appendChild(li);
        });
      });
    }

    function renderEmailList(emails) {
        mailbox.innerHTML = "";
    
        if (!emails || emails.length === 0) {
            mailbox.textContent = "Ingen e-mails fundet.";
            return;
        }
    
        emails.forEach(email => {
            const div = document.createElement("div");
            div.className = `email ${email.isRead ? "read" : "unread"}`;
            div.textContent = `${email.label ? `[${email.label}] ` : ""}${email.fromName} - ${email.subject}`;
            div.dataset.emailId = email.id;
            div.dataset.accountEmail = email.label;
    
            div.addEventListener("click", () =>
                showEmailContent(
                    email.subject,
                    email.fromName,
                    email.fromEmail,
                    email.body,
                    email.id,
                    false,
                    [],
                    email.label,
                    email.payload
                )
            );
    
            mailbox.appendChild(div);
        });
    }
    async function fetchAllAccountsEmails(forceFresh = false) {
        if (isFetching) return;
        isFetching = true;
    
        const cacheKey = "cachedEmails";
        const cacheTTL = 5 * 60 * 1000;
    
        const cached = await chrome.storage.session.get(cacheKey);
        const cachedData = cached[cacheKey];
    
        // ✅ Kun vis cached hvis det er tilladt og stadig gyldigt
        if (!forceFresh && cachedData && (Date.now() - cachedData.timestamp < cacheTTL)) {
            renderEmailList(cachedData.emails);
            isFetching = false;
            return;
        } else {
            mailbox.innerHTML = "<p>🔄 Loading e-mails...</p>";
        }
    
        try {
            const { accounts } = await chrome.storage.local.get("accounts");
            if (!accounts || accounts.length === 0) {
                mailbox.textContent = "Ingen konti fundet. Tilføj en mailkonto under Indstillinger.";
                return;
            }
    
            const fetchPromises = accounts.map(acc =>
                fetchEmails(acc.accessToken, null, [], null, acc.email)
                    .then(emails => emails || [])
                    .catch(err => {
                        console.error(`Fejl ved hentning af e-mails for ${acc.email}:`, err);
                        return [];
                    })
            );
    
            const results = await Promise.all(fetchPromises);
            const allEmails = results.flat();
    
            allEmails.sort((a, b) => b.internalDate - a.internalDate);
    
            // Gem til cache
            await chrome.storage.session.set({
                [cacheKey]: {
                    timestamp: Date.now(),
                    emails: allEmails
                }
            });
    
            renderEmailList(allEmails);
    
        } catch (err) {
            console.error("Fejl i fetchAllAccountsEmails:", err);
            mailbox.textContent = "❌ Der opstod en fejl under hentning af e-mails.";
        } finally {
            isFetching = false;
        }
    }   

  
async function fetchEmails(accessToken, nextPageToken = null, validEmails = [], filterFn = null, label = null) {
        const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
      
        let res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      
        if (res.status === 401 && label) {
          try {
            const { accounts } = await chrome.storage.local.get("accounts");
            const current = accounts.find(acc => acc.email === label);
      
            const newToken = await refreshAccessToken(label);
            if (!newToken) return;
      
            return fetchEmails(newToken, nextPageToken, validEmails, filterFn, label);
          } catch (err) {
            console.error("Fejl under token refresh:", err);
            return;
          }
        }
      
        if (!res.ok) {
          console.error("Fejl ved fetch af mails:", res.status, res.statusText);
          return;
        }
      
        const data = await res.json();
        const messages = data.messages || [];

        if (label && data.nextPageToken) {
            nextPageTokensByAccount[label] = data.nextPageToken;
        }

      
        const emailDetails = await Promise.all(messages.map(msg =>
          fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
            .then(res => res.json())
            .then(email => {
              const headers = email.payload?.headers || [];
              const subject = headers.find(h => h.name === "Subject")?.value || "No Subject";
              const fromHeader = headers.find(h => h.name === "From")?.value || "Unknown sender";
              const fromName = fromHeader.split("<")[0].trim();
              const fromEmail = fromHeader.match(/<([^>]+)>/)?.[1] || "";
              const body = getEmailBody(email.payload);
              const isRead = !(email.labelIds || []).includes("UNREAD");
              const internalDate = parseInt(email.internalDate, 10);
      
              return { id: email.id, subject, fromName, fromEmail, body, payload: email.payload, isRead, internalDate, label };
            })
            .catch(err => {
              console.warn("Error loading mail:", err);
              return null;
            })
        ));
      
        return emailDetails.filter(e => e);
    }      
  
    async function loadMoreEmails() {
        const { accounts } = await chrome.storage.local.get("accounts");
    
        const fetchPromises = accounts.map(async acc => {
            const nextToken = nextPageTokensByAccount[acc.email];
            if (!nextToken) return [];
    
            return fetchEmails(acc.accessToken, nextToken, [], null, acc.email)
                .then(emails => emails || [])
                .catch(() => []);
        });
    
        const results = await Promise.all(fetchPromises);
        const moreEmails = results.flat();
    
        if (moreEmails.length > 0) {
            moreEmails.sort((a, b) => b.internalDate - a.internalDate);
            const existingEmails = Array.from(mailbox.children).map(div => div.dataset.emailId);
            const newOnes = moreEmails.filter(e => !existingEmails.includes(e.id));
            newOnes.forEach(email => {
                const div = document.createElement("div");
                div.className = `email ${email.isRead ? "read" : "unread"}`;
                div.textContent = `${email.label ? `[${email.label}] ` : ""}${email.fromName} - ${email.subject}`;
                div.dataset.emailId = email.id;
                div.dataset.accountEmail = email.label;
                div.addEventListener("click", () =>
                    showEmailContent(email.subject, email.fromName, email.fromEmail, email.body, email.id, false, [], email.label)
                );
                mailbox.appendChild(div);
            });
        } else {
            loadMoreButton.style.display = "none"; // skjul knappen hvis intet nyt
        }
    }    
    
    inboxButton.addEventListener("click", () => {
        mailbox.innerHTML = "";
        mailbox.style.display = "block";
        inboxButton.style.display = "none";
        emailContent.style.display = "none";
        loadMoreButton.style.display = "inline-block";
        sentEmailsButton.style.display = "inline-block";

        const searchContainer = document.getElementById("search-container");
        if (searchContainer) searchContainer.style.display = "flex";

        fetchAllAccountsEmails(); // Hent alle emails fra alle konti
    });
  
    function getEmailBody(payload) {
        if (!payload) return "";
      
        if (payload.body?.data) {
          return decodeBase64(payload.body.data);
        }
      
        let htmlContent = "";
        let textContent = "";
      
        if (payload.parts) {
          for (const part of payload.parts) {
            if (part.mimeType === "text/html" && part.body?.data) {
              htmlContent = decodeBase64(part.body.data);
            }
            if (part.mimeType === "text/plain" && part.body?.data) {
              textContent = decodeBase64(part.body.data);
            }
          }
      
          for (const part of payload.parts) {
            const nested = getEmailBody(part);
            if (nested) {
              if (!htmlContent && nested.includes("<html")) {
                htmlContent = nested;
              } else if (!textContent) {
                textContent = nested;
              }
            }
          }
        }
      
        if (htmlContent) return htmlContent;
        if (textContent) return textContent.replace(/\\n/g, "<br>");
        return "";
    }
    
    function decodeBase64(encoded) {
        try {
        const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
        return decodeURIComponent(escape(decoded));
        } catch {
        return "(Couldn't decode content)";
        }
    }
    
    
    chrome.storage.local.get("accounts", ({ accounts }) => {
        if (!accounts || accounts.length === 0) {
            mailbox.textContent = "You are not logged in. Please add account under settings.";
            return;
        }
        fetchAllAccountsEmails();
    });
    
    async function fetchSentEmails(label) {
        const mailbox = document.getElementById("mailbox"); // Hent mailbox reference her
        if (mailbox) {
            mailbox.innerHTML = ""; // Ryd mailbox for sendte mails
        }
    
        const { accounts = [] } = await chrome.storage.local.get("accounts");
        const current = accounts.find(acc => acc.email === label);
        if (!current?.accessToken) {
            console.warn("No token avaliable for sent mails for:", label);
            if (mailbox) mailbox.textContent = `Couldn't renew token for sent mails for:${label} (No access).`;
            return; // Returner hvis ingen adgangstoken
        }
    
        const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=SENT`;
    
        let res = await fetch(url, {
            headers: { Authorization: `Bearer ${current.accessToken}` }
        });
    
        if (res.status === 401) {
            const newToken = await refreshAccessToken(label);
            if (!newToken) {
                console.error("Couldn't renew token for sent mails for:", label);
                if (mailbox) mailbox.textContent = `Couldn't renew token for sent mails for ${label}.`;
                return;
            }
    
            const updatedAccounts = accounts.map(acc =>
                acc.email === label ? { ...acc, accessToken: newToken } : acc
            );
            await chrome.storage.local.set({ accounts: updatedAccounts });
    
            return fetchSentEmails(label); // Prøv igen med nyt token
        }
    
        if (!res.ok) {
            console.error(`Error loading sent mails for ${label}:`, res.status, res.statusText);
            if (mailbox) mailbox.textContent = `Error loading sent mails for ${label}.`;
            return;
        }
    
        const data = await res.json();
        const messages = data.messages || [];
    
        if (messages.length === 0) {
            if (mailbox) mailbox.textContent = `No send mails found for ${label}.`;
            return [];
        }
    
        const emailDetails = await Promise.all(messages.map(msg =>
            fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { Authorization: `Bearer ${current.accessToken}` }
            })
                .then(res => res.json())
                .then(email => {
                    const headers = email.payload?.headers || [];
                    const subject = headers.find(h => h.name === "Subject")?.value || "Ingen emne";
                    // For sendte mails er 'To'-headeren den relevante modtager.
                    const toHeader = headers.find(h => h.name === "To")?.value || "Ukendt modtager";
                    const toName = toHeader.split("<")[0].trim();
                    const toEmail = toHeader.match(/<([^>]+)>/)?.[1] || "";
                    const body = getEmailBody(email.payload);
                    const internalDate = parseInt(email.internalDate, 10);
    
                    return { id: email.id, subject, fromName: toName, fromEmail: toEmail, body, isRead: true, internalDate, label }; // Added label
                })
                .catch(err => {
                    console.warn(`Fejl ved hentning af detaljer for sendt email for ${label}:`, err);
                    return null;
                })
        ));
    
        const validSentEmails = emailDetails.filter(e => e);
        validSentEmails.sort((a, b) => b.internalDate - a.internalDate);
    
        // Vis de sendte mails i mailboxen
        if (mailbox) {
            validSentEmails.forEach(email => {
                const div = document.createElement("div");
                div.className = `email read`; // Sendte mails betragtes typisk som læste
                div.textContent = `${label ? `[${label}] ` : ""}${email.fromName} - ${email.subject}`; // Viser modtageren
                div.dataset.emailId = email.id;
                div.dataset.accountEmail = email.label; // Gem kontoens e-mail
    
                div.addEventListener("click", () =>
                    // isSent parameteren skal være 'true' for sendte mails
                    showEmailContent(email.subject, email.fromName, email.fromEmail, email.body, email.id, true, [], email.label)
                );
                mailbox.appendChild(div);
            });
        }
    
        return validSentEmails; // Returnerer stadig, men viser nu også
    }     

    document.getElementById("search-button").addEventListener("click", () => {
        const searchTerm = document.getElementById("search-input").value.trim();
        if (!searchTerm) return;
        searchGmailAcrossAccounts(searchTerm);
    });    
    
    
    document.getElementById("clear-search").addEventListener("click", () => {
        document.getElementById("search-input").value = "";
        fetchAllAccountsEmails(); // Hent alle emails igen
    });
    
    // Enter-tast support
    document.getElementById("search-input").addEventListener("keypress", e => {
        if (e.key === "Enter") {
            document.getElementById("search-button").click();
        }
    });
    
    sentEmailsButton.addEventListener("click", async () => { // Gør den async
        hideSearch();
        loadMoreButton.style.display = "none";
        sentEmailsButton.style.display = "none";
        inboxButton.style.display = "block";
    
        const mailbox = document.getElementById("mailbox");
        if (mailbox) {
            mailbox.innerHTML = ""; // Ryd mailboxen før indlæsning af sendte mails
        }
    
        const { accounts = [] } = await chrome.storage.local.get("accounts"); // Hent konti her
        if (accounts.length === 0) {
            if (mailbox) mailbox.textContent = "No account to show sent mails from.";
            return;
        }
    
        // Hent sendte mails for alle konti samtidig
        const allSentFetches = accounts.map(acc => fetchSentEmails(acc.email));
        await Promise.all(allSentFetches); // Vent på, at alle hentninger er færdige og vises
        
        console.log("All sent mails loaded and shown.");
    });
    

    function showEmailContent(subject,fromName,fromEmail,body,emailId,isSent = false, attachments = [],accountEmail,payload = null) {
        // DETTE ER DEN ALLERFØRSTE LINJE KODE INDE I FUNKTIONEN
        console.log("DEBUG: showEmailContent kaldt. accountEmail (param) ved start:", accountEmail);
    
        // Brug en lokal konstant for konto-identifikatoren for at undgå forvirring og utilsigtet overskrivning
        const currentAccountIdentifier = accountEmail;
    
        if (!currentAccountIdentifier) {
            console.warn("DEBUG: currentAccountIdentifier er blank/undefined inde i showEmailContent. Dette er kerneproblemet!");
        }
    
        // Element-deklarationer (Antager, at disse er globalt tilgængelige eller defineret tidligere i DOMContentLoaded scope)
        // Hvis disse ikke er defineret, vil du få 'is not defined' fejl for dem, medmindre de er deklareret andre steder.
        const emailContent = document.getElementById("email-content");
        const mailbox = document.getElementById("mailbox");
        const sentEmailsButton = document.getElementById("Sent-emails"); // Tilføjet, da den bruges senere
        const loadMoreButton = document.getElementById("loadMoreButton"); // Tilføjet, da den bruges senere
        const searchContainer = document.getElementById("search-container");
        const addAccountButton = document.getElementById("add-account-button");
        const newEmailButton = document.getElementById("new-email-button");
        const settingsButton = document.getElementById("settings-button");
        const accountList = document.getElementById("account-list");
        const themeContainer = document.getElementById("theme-container");
        const colorPicker = document.getElementById("color-picker");
        const loggedInMessage = document.getElementById("logged-in-message");
    
    
        if (emailContent) { // Tjekker om elementet faktisk findes før manipulation
            emailContent.style.display = "block";
        }
        if (mailbox) mailbox.style.display = "none";
        if (settingsContent) settingsContent.style.display = "none";
        if (sentEmailsButton) sentEmailsButton.style.display = "none";
        if (loadMoreButton) loadMoreButton.style.display = "none";
        if (searchContainer) searchContainer.style.display = "none";
        if (addAccountButton) addAccountButton.style.display = "none";
        if (newEmailButton) newEmailButton.style.display = "none";
        if (settingsButton) settingsButton.style.display = "none";
        if (accountList) accountList.style.display = "none";
        if (themeContainer) themeContainer.style.display = "none";
        if (colorPicker) colorPicker.style.display = "none";
        if (loggedInMessage) loggedInMessage.style.display = "none";
    
    
        chrome.storage.local.get("themeColor", ({ themeColor }) => {
            const color = themeColor || "#12446c";
    
            const replySectionHTML = `
                <div id="reply-section" style="display: none; margin-top: 2em;">
                    <h3>Answer the mail:</h3>
                    <textarea id="reply-body" rows="5" style="width: 100%; padding: 0.5em;"></textarea>
                    <button id="send-reply" style="margin-top: 0.5em; background-color: ${color}; color: white;">Send mail</button>
                    <p id="reply-status" style="margin-top: 0.5em;"></p>
                </div>
            `;
    
            if (emailContent) { // Sikrer at emailContent er tilgængelig før innerHTML sættes
                emailContent.innerHTML = `
                   <div style="display: flex; gap: 0.5em; margin-bottom: 1em;">
                     <button id="back-button" style="background-color: ${color}; color: white;">Back</button>
                    ${!isSent ? `
                   <button id="reply-button" style="background-color: ${color}; color: white;">Reply</button>
                     <button id="forward-button" style="background-color: ${color}; color: white;">Forward</button>
                   <button id="delete-button" style="background-color: ${color}; color: white;">Delete</button>` : ""}
                    </div>
    
                    <h2>${subject}</h2>
                    <p><strong>${isSent ? "Til" : "Fra"}:</strong> ${fromName} (${fromEmail})</p>
                    <iframe
                        id="email-body-iframe"
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                        style="width: 100%; height: 60vh; border: none; margin-top: 1em;"
                    ></iframe>
                    ${!isSent ? replySectionHTML : ""}
                `;
            }
    
            window.currentEmailPayload = payload;

            const iframe = document.getElementById("email-body-iframe");
            if (iframe) {
                const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: sans-serif; padding: 1em; color: #333; }
                            img { max-width: 100%; height: auto; display: block; margin: 1em 0; }
                            a { color: ${color}; text-decoration: underline; }
                        </style>
                    </head>
                    <body>${body || "<p>Couldn't load e-mail content.</p>"}</body>
                    </html>
                `;

                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write(html);
                doc.close();

                iframe.addEventListener("load", () => {
                    const links = iframe.contentDocument.querySelectorAll("a[href^='http']");
                    links.forEach(link => {
                        link.addEventListener("click", e => {
                            e.preventDefault();
                            chrome.tabs.create({ url: link.href });
                        });
                    });
                });
            }

    
            const replyButton = document.getElementById("reply-button");
            if (replyButton) {
                replyButton.addEventListener("click", () => {
                    const replySection = document.getElementById("reply-section");
                    if (replySection) {
                        replySection.style.display = "block";
                        document.getElementById("reply-body").focus();
                    }
                });
            }
    
            const deleteButton = document.getElementById("delete-button");
            if (deleteButton) {
                deleteButton.addEventListener("click", async () => {
                    console.log("DEBUG: Delete button clicked. Calling deleteEmail with emailId:", emailId, "and accountEmail:", currentAccountIdentifier);

                    await deleteEmail(emailId, currentAccountIdentifier); // Vent på sletning
                    await chrome.storage.session.remove("cachedEmails");   // Slet cache
                    fetchAllAccountsEmails(true);                          // Tving ny hentning
                });
            }
            const forwardButton = document.getElementById("forward-button");
            if (forwardButton) {
            forwardButton.addEventListener("click", async () => {
                const forwardTo = prompt("Forward to (email address):");
                if (!forwardTo) return;
                try {
                await forwardEmail(window.currentEmailPayload, forwardTo, accountEmail);
                alert("✅ Mail forwarded!");
                } catch (err) {
                console.error("Fejl ved videresendelse:", err);
                alert("❌ Kunne ikke videresende mailen.");
                }
            });
            }

    
            const sendReplyButton = document.getElementById("send-reply");
            if (sendReplyButton) {
            sendReplyButton.addEventListener("click", async () => {
                const replyText = document.getElementById("reply-body").value.trim();
                const status = document.getElementById("reply-status");

                if (!replyText) {
                    status.textContent = "Message body cannot be empty.";
                    return;
                }

                status.textContent = "Sending...";

                try {
                    await sendEmail(
                        fromEmail,
                        subject.startsWith("Re:") ? subject : `Re: ${subject}`,
                        replyText,
                        accountEmail // <-- dette er vigtigt
                    );
                    status.textContent = "✅ Answer send!";
                    document.getElementById("reply-body").value = "";
                } catch (err) {
                    console.error("Fejl ved afsendelse:", err);
                    status.textContent = "❌ Couldn't send this messsage.";
                }
             });
         }

            // Tilbageknap (Back button) - sikrer den refererer korrekt element
            const backButton = document.getElementById("back-button");
            if (backButton) {
                backButton.addEventListener("click", async () => {
                    if (emailContent) {
                        emailContent.innerHTML = "";
                        emailContent.style.display = "none";
                    }

                    if (mailbox) {
                        mailbox.innerHTML = "";
                        mailbox.style.display = "block";
                    }

                    if (sentEmailsButton) sentEmailsButton.style.display = "inline-block";
                    if (loadMoreButton) loadMoreButton.style.display = "inline-block";
                    if (settingsButton) settingsButton.style.display = "inline-block";
                    if (inboxButton) inboxButton.style.display = "none";

                    const searchContainer = document.getElementById("search-container");
                    if (searchContainer) searchContainer.style.display = "flex";

                    await chrome.storage.session.remove("cachedEmails");
                    fetchAllAccountsEmails(true);
                });
            }

    
    
            // Kald markEmailAsRead her
            markEmailAsRead(emailId, currentAccountIdentifier);
        });
    }
    

    window.addEventListener('message', (event) => {
        if (event.data?.type === 'openLink' && typeof event.data.url === 'string') {
            chrome.tabs.create({ url: event.data.url });
        }
    });
     
    async function sendEmail(to, subject, body, accountEmail) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.get("accounts", async ({ accounts = [] }) => {
            const account = accounts.find(a => a.email === accountEmail);
            if (!account) return reject("Konto ikke fundet");
      
            let tokenToUse = account.accessToken;
      
            const rawMessage = [
              `To: ${to}`,
              `Subject: ${subject}`,
              "Content-Type: text/plain; charset=\"UTF-8\"",
              "",
              body
            ].join("\r\n");
      
            const base64EncodedEmail = btoa(unescape(encodeURIComponent(rawMessage)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
      
            const trySend = async (accessToken) => {
              return await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ raw: base64EncodedEmail })
              });
            };
      
            let res = await trySend(tokenToUse);
      
            if (res.status === 401) {
              const newToken = await refreshAccessToken(accountEmail);
              if (!newToken) return reject("Kunne ikke forny token");
      
              res = await trySend(newToken);
            }
      
            if (!res.ok) {
              const errorText = await res.text();
              return reject("Fejl ved afsendelse: " + errorText);
            }
      
            resolve(await res.json());
          });
        });
    }

    async function markEmailAsRead(emailId, accountEmailToMark) {
        try {
            const { accounts } = await chrome.storage.local.get("accounts");
            if (!accounts || accounts.length === 0) return;
    
            const targetAccount = accounts.find(acc => acc.email === accountEmailToMark);
            if (!targetAccount) {
                console.error("Konto ikke fundet for markering som læst:", accountEmailToMark);
                return;
            }
    
            const res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${targetAccount.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ removeLabelIds: ["UNREAD"] })
            });
    
            if (!res.ok) {
                console.error("Fejl ved markering som læst:", res.status, res.statusText);
                return;
            }
    
            const { cachedEmails } = await chrome.storage.session.get("cachedEmails");
            if (cachedEmails?.emails?.length) {
                const updatedEmails = cachedEmails.emails.map(email =>
                    email.id === emailId ? { ...email, isRead: true } : email
                );
                await chrome.storage.session.set({
                    cachedEmails: {
                        ...cachedEmails,
                        emails: updatedEmails,
                        timestamp: cachedEmails.timestamp,
                    }
                });
            }
    
        } catch (err) {
            console.error("Uventet fejl i markEmailAsRead:", err);
        }
    }     
    async function forwardEmail(originalEmail, forwardTo, accountEmail) {
        return new Promise(async (resolve, reject) => {
          try {
            const { accounts = [] } = await chrome.storage.local.get("accounts");
            const account = accounts.find(a => a.email === accountEmail);
            if (!account) return reject("Konto ikke fundet");
      
            let accessToken = account.accessToken;
      
            // Find originale headers
            const headers = originalEmail.payload.headers || [];
            const subject = headers.find(h => h.name === "Subject")?.value || "No Subject";
            const from = headers.find(h => h.name === "From")?.value || "Unknown sender";
            const date = headers.find(h => h.name === "Date")?.value || "";
      
            // Hent original body
            const bodyContent = getEmailBody(originalEmail.payload) || "";
      
            // Hent vedhæftninger (hvis nogen)
            let attachments = [];
            if (originalEmail.payload.parts) {
              for (const part of originalEmail.payload.parts) {
                if (part.body?.attachmentId) {
                  const res = await fetch(
                    `https://www.googleapis.com/gmail/v1/users/me/messages/${originalEmail.id}/attachments/${part.body.attachmentId}`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                  );
                  const data = await res.json();
                  attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType,
                    data: data.data
                  });
                }
              }
            }
      
            // Byg MIME
            let boundary = "myBoundaryString";
            let mime = [
              `To: ${forwardTo}`,
              `Subject: Fwd: ${subject}`,
              "MIME-Version: 1.0",
              `Content-Type: multipart/mixed; boundary=${boundary}`,
              "",
              `--${boundary}`,
              "Content-Type: text/html; charset=UTF-8",
              "",
              `<p>Forwarded message:</p>
               <p><b>From:</b> ${from}<br>
               <b>Date:</b> ${date}<br>
               <b>Subject:</b> ${subject}</p>
               <hr>${bodyContent}`
            ];
      
            for (const att of attachments) {
              mime.push(
                `--${boundary}`,
                `Content-Type: ${att.mimeType}; name="${att.filename}"`,
                "Content-Transfer-Encoding: base64",
                `Content-Disposition: attachment; filename="${att.filename}"`,
                "",
                att.data
              );
            }
      
            mime.push(`--${boundary}--`);
      
            // Base64url‐encode
            const base64EncodedEmail = btoa(unescape(encodeURIComponent(mime.join("\r\n"))))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
      
            // Send via Gmail API
            const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ raw: base64EncodedEmail })
            });
      
            if (!res.ok) {
              const errorText = await res.text();
              return reject("Fejl ved videresendelse: " + errorText);
            }
      
            resolve(await res.json());
          } catch (err) {
            reject(err);
          }
        });
    }
      
    async function searchGmailAcrossAccounts(query) {
        if (!query) return;
    
        mailbox.innerHTML = "<p>Searching in your accounts...</p>";
    
        const { accounts = [] } = await chrome.storage.local.get("accounts");
    
        if (accounts.length === 0) {
            mailbox.textContent = "No account available for search.";
            return;
        }
    
        const fetchPromises = accounts.map(async acc => {
            let token = acc.accessToken;
    
            const fetchSearchResults = async () => {
                const url = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`;
    
                let res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` }
                });
    
                // Token udløbet? Prøv refresh
                if (res.status === 401) {
                    token = await refreshAccessToken(acc.email);
                    if (!token) return [];
    
                    res = await fetch(url, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }
    
                if (!res.ok) {
                    console.warn("Search error for account:", acc.email, res.status, res.statusText);
                    return [];
                }
    
                const data = await res.json();
                const messages = data.messages || [];
    
                // Hent detaljer for hver besked
                const detailed = await Promise.all(messages.map(msg =>
                    fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                        .then(res => res.json())
                        .then(email => {
                            const headers = email.payload?.headers || [];
                            const subject = headers.find(h => h.name === "Subject")?.value || "No subject";
                            const fromHeader = headers.find(h => h.name === "From")?.value || "Unknown sender";
                            const fromName = fromHeader.split("<")[0].trim();
                            const fromEmail = fromHeader.match(/<([^>]+)>/)?.[1] || "";
                            const body = getEmailBody(email.payload);
                            const isRead = !(email.labelIds || []).includes("UNREAD");
                            const internalDate = parseInt(email.internalDate, 10);
    
                            return { id: email.id, subject, fromName, fromEmail, body, isRead, internalDate, label: acc.email };
                        })
                        .catch(() => null)
                ));
    
                return detailed.filter(e => e);
            };
    
            return await fetchSearchResults();
        });
    
        const results = (await Promise.all(fetchPromises)).flat();
    
        if (results.length === 0) {
            mailbox.innerHTML = "<p>No results found.</p>";
            return;
        }
    
        results.sort((a, b) => b.internalDate - a.internalDate);
        renderEmailList(results);
    }    
      
    function hideSearch() {
        const searchContainer = document.getElementById("search-container");
        if (searchContainer) searchContainer.style.display = "none";
        document.getElementById("search-input").value = "";
        mailbox.innerHTML = "";
    }
    
    async function deleteEmail(emailId, accountEmail) {
        const { accounts = [] } = await chrome.storage.local.get("accounts");
        const current = accounts.find(acc => acc.email === accountEmail);
        if (!current?.accessToken) return;
      
        let res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${emailId}/trash`, {
          method: "POST",
          headers: { Authorization: `Bearer ${current.accessToken}` }
        });
      
        if (res.status === 401) {
          const newToken = await refreshAccessToken(accountEmail);
          if (!newToken) return;
      
          const updatedAccounts = accounts.map(acc =>
            acc.email === accountEmail ? { ...acc, accessToken: newToken } : acc
          );
          await chrome.storage.local.set({ accounts: updatedAccounts });
      
          return deleteEmail(emailId, accountEmail); // Prøv igen
        }
      
        if (res.ok) {
            emailContent.innerHTML = "";
            emailContent.style.display = "none";
          
            mailbox.innerHTML = "";
            mailbox.style.display = "block"; 
            sentEmailsButton.style.display = "inline-block";
            loadMoreButton.style.display = "inline-block";
            settingsButton.style.display = "inline-block";
          
            const searchContainer = document.getElementById("search-container");
            if (searchContainer) searchContainer.style.display = "flex";
          
            fetchAllAccountsEmails();
          }
           else {
          console.error("Delete failed:", res.statusText);
        }
    }

    loadMoreButton.addEventListener("click", () => {
        loadMoreEmails();
    });
    

    settingsButton?.addEventListener("click", () => {
        hideSearch();
        mailbox.style.display = "none";
        settingsContent.style.display = "block";
        emailContent.style.display = "none";
        sentEmailsButton.style.display = "none";
        loadMoreButton.style.display = "none";
        settingsButton.style.display = "none";
        inboxButton.style.display = "none";
        if (addAccountButton) addAccountButton.style.display = "block";
        if (accountList) accountList.style.display = "block";
        if (colorPicker) colorPicker.style.display = "flex"; 
    
        setupColorPicker();
        renderAccountList();
    });

    backToMailboxButton?.addEventListener("click", async () => {
        settingsContent.style.display = "none";
        emailContent.style.display = "none";
        mailbox.innerHTML = "";
        mailbox.style.display = "block";
        inboxButton.style.display = "none";
        loadMoreButton.style.display = "inline-block";
        sentEmailsButton.style.display = "inline-block";
        settingsButton.style.display = "inline-block";
    
        const searchContainer = document.getElementById("search-container");
        if (searchContainer) searchContainer.style.display = "flex";
    
        if (window.lastOpenedEmail?.id && window.lastOpenedEmail?.account) {
            await markEmailAsRead(window.lastOpenedEmail.id, window.lastOpenedEmail.account);
            window.lastOpenedEmail = null;
        }
        chrome.storage.session.remove("cachedEmails", () => {
            fetchAllAccountsEmails(true);
        });
    });
    
    function setupColorPicker() {
        if (!colorPicker) return;
        colorPicker.innerHTML = ""; // Ryd gamle farver
    
        const colors = [
            { name: "Blåbær", hex: "#12446c" },
            { name: "Safir", hex: "#0078d7" },
            { name: "Aqua", hex: "#00bcd4" },
            { name: "Himmel", hex: "#2196f3" },
            { name: "Midnat", hex: "#001f3f" },
            { name: "Jordbær", hex: "#ff4136" },
            { name: "Bubble Gum", hex: "#ff80ab" },
            { name: "Vandmelon", hex: "#ff6384" },
            { name: "Candy Floss", hex: "#ffb6c1" },
            { name: "Abrikos", hex: "#ffc107" },
            { name: "Lavendel", hex: "#b39ddb" },
            { name: "Hindbær", hex: "#e91e63" },
            { name: "Blomme", hex: "#9c27b0" },
            { name: "Appelsin", hex: "#ff9800" },
            { name: "Skifer", hex: "#607d8b" },
            { name: "Skov", hex: "#4caf50" },
            { name: "Græs", hex: "#8bc34a" },
            { name: "Blad", hex: "#cddc39" },
            { name: "Mint", hex: "#a5d6a7" },
            { name: "Jet", hex: "#000000" }
        ];
    
        colors.forEach(color => {
            const box = document.createElement("div");
            box.className = "color-box";
            box.style.backgroundColor = color.hex;
            box.title = color.name;
            box.addEventListener("click", () => {
                chrome.storage.local.set({ themeColor: color.hex }, () => applyThemeColor(color.hex));
            });
            colorPicker.appendChild(box);
        });
    
        chrome.storage.local.get("themeColor", ({ themeColor }) => {
            if (themeColor) applyThemeColor(themeColor);
        });
    }

    function applyThemeColor(color) {
        if (header) header.style.backgroundColor = color;
        if (backToMailboxButton) backToMailboxButton.style.backgroundColor = color;
        if (settingsButton) settingsButton.style.backgroundColor = color;
        if (inboxButton) inboxButton.style.backgroundColor = color;
        if (sentEmailsButton) sentEmailsButton.style.backgroundColor = color;
        if (addAccountButton) addAccountButton.style.backgroundColor = color;
    
        // Tilbageknap i emailvisning
        const observer = new MutationObserver(() => {
            const emailBackButton = document.querySelector("#email-content #back-button");
            if (emailBackButton) {
                emailBackButton.style.backgroundColor = color;
                observer.disconnect();
            }
        });
    
        observer.observe(document.getElementById("email-content"), { childList: true, subtree: true });
    }
    
renderAccountList();
    chrome.runtime.sendMessage({ type: "update-badge" }); 
});