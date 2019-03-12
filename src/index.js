const { google } = require("googleapis");
const auth = require("./auth");
const _ = require("lodash/fp");
const fs = require("fs");

// TODO: extract to config
const SPREAD_SHEET_ID = "1hfzvE6s2oZ9Ad0jXH59alyinDuAJQDjQzjIGByXPuvs";

const LANGUAGES = {
  en: "EN",
  de: "DE",
  pl: "PL"
};

const BASE_LANG = "pl";

auth.setup(auth => {
  const intlMessages = JSON.parse(
    fs.readFileSync("intl-messages.json", "utf8")
  ).map(message => ({ id: message.id, message: message.defaultMessage }));

  readSpreadSheet(auth, intlMessages);
});

// base lang
// id | base lang

// every other lang
// id from base lang | from base lang | current lang

async function readSpreadSheet(auth, intlMessages) {
  const baseLanguageMessages = await readValues(
    auth,
    `${LANGUAGES[BASE_LANG]}!A2:B`
  ).then(data => data.map(row => ({ id: row[0], message: row[1] })));
  const otherLanguages = _.omit(BASE_LANG, LANGUAGES);
  const otherData = await Promise.all(
    Object.keys(otherLanguages).map(key => {
      return readValues(auth, `${LANGUAGES[key]}!A2:C`);
    })
  ).then(data => {
    return Object.keys(otherLanguages).map((key, index) => {
      return {
        key,
        rows: data[index].map(row => ({
          id: row[0],
          ref: row[1],
          message: row[2]
        }))
      };
    });
  });

  const newMessages = _.differenceBy("id", intlMessages, baseLanguageMessages);
  const staleIds = _.differenceBy("id", baseLanguageMessages, intlMessages).map(
    message => message.id
  );

  const newBase = baseLanguageMessages
    .filter(message => !staleIds.includes(message.id))
    .concat(newMessages);

  const newOtherLanguages = _.mapValues(languageData => {
    return languageData.rows
      .filter(message => !staleIds.includes(message.id))
      .concat(
        newMessages.map(message => ({
          id: message.id,
          ref: message.message,
          value: ""
        }))
      );
  }, _.keyBy("key", otherData));

  // CLEAR VALUES
  await clearValues(auth, `${LANGUAGES[BASE_LANG]}!A2:B`);
  await Promise.all(
    Object.keys(otherLanguages).map(key => {
      return updateValues(auth, `${LANGUAGES[key]}!A2:C`);
    })
  );

  // UPDATE VALUES
  await updateValues(
    auth,
    `${LANGUAGES[BASE_LANG]}!A2:B`,
    newBase.map(message => [message.id, message.message])
  );

  await Promise.all(
    Object.keys(otherLanguages).map(key => {
      return updateValues(
        auth,
        `${LANGUAGES[key]}!A2:C`,
        newOtherLanguages[key].map(message => [
          message.id,
          message.ref,
          message.message
        ])
      );
    })
  );
}

function readValues(auth, range) {
  const sheets = google.sheets({ version: "v4", auth });
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.get(
      {
        spreadsheetId: SPREAD_SHEET_ID,
        range
      },
      (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res.data.values || []);
        }
      }
    );
  });
}

function updateValues(auth, range, values) {
  const sheets = google.sheets({ version: "v4", auth });
  sheets.spreadsheets.values.batchUpdate(
    {
      spreadsheetId: SPREAD_SHEET_ID,
      resource: {
        valueInputOption: "RAW",
        data: [{ range, values }]
      }
    },
    (err, res) => {
      if (err) {
        console.error(err);
      }
    }
  );
}

function clearValues(auth, range) {
  const sheets = google.sheets({ version: "v4", auth });
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.clear(
      {
        spreadsheetId: SPREAD_SHEET_ID,
        range
      },
      (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res.data.values || []);
        }
      }
    );
  });
}
