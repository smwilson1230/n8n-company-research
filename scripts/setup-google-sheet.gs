/**
 * Setup script for Company Research Tracker.
 *
 * Usage:
 *   1. Go to https://script.google.com → New Project
 *   2. Paste this entire file into the editor
 *   3. Run the setup() function
 *   4. Authorize when prompted (Sheets, Docs, Drive scopes)
 *   5. Copy the environment variable IDs from the alert dialog / execution log
 */

function setup() {
  var sheet = createTrackingSheet();
  var folder = createDriveFolder();
  var doc = createSummaryDoc(folder);

  var output = [
    'Add these to your n8n environment variables:',
    '',
    'GOOGLE_SHEET_ID=' + sheet.getId(),
    'GOOGLE_DRIVE_FOLDER_ID=' + folder.getId(),
    'MASTER_SUMMARY_DOC_ID=' + doc.getId()
  ].join('\n');

  Logger.log(output);
  SpreadsheetApp.getUi().alert(output);
}

/**
 * Creates the "Company Research Tracker" spreadsheet with Companies and Leaders tabs.
 */
function createTrackingSheet() {
  var ss = SpreadsheetApp.create('Company Research Tracker');

  // -- Companies tab (rename the default Sheet1) --
  var companiesTab = ss.getSheets()[0];
  companiesTab.setName('Companies');

  var companiesHeaders = [
    'Company Name',
    'Ticker',
    'Website',
    'LinkedIn URL',
    'Status',
    'Last Researched'
  ];
  var headerRange = companiesTab.getRange(1, 1, 1, companiesHeaders.length);
  headerRange.setValues([companiesHeaders]);
  headerRange.setFontWeight('bold');
  companiesTab.setFrozenRows(1);

  // Auto-resize columns to fit header text
  for (var i = 1; i <= companiesHeaders.length; i++) {
    companiesTab.autoResizeColumn(i);
  }

  // -- Leaders tab --
  var leadersTab = ss.insertSheet('Leaders');

  var leadersHeaders = [
    'Company',
    'Name',
    'Title',
    'LinkedIn URL',
    'Key Background',
    'Talking Points',
    'Date Found'
  ];
  var leaderHeaderRange = leadersTab.getRange(1, 1, 1, leadersHeaders.length);
  leaderHeaderRange.setValues([leadersHeaders]);
  leaderHeaderRange.setFontWeight('bold');
  leadersTab.setFrozenRows(1);

  for (var i = 1; i <= leadersHeaders.length; i++) {
    leadersTab.autoResizeColumn(i);
  }

  Logger.log('Created spreadsheet: ' + ss.getUrl());
  return ss;
}

/**
 * Creates the "Company Research Docs" folder in Google Drive.
 */
function createDriveFolder() {
  var folder = DriveApp.createFolder('Company Research Docs');
  Logger.log('Created folder: ' + folder.getUrl());
  return folder;
}

/**
 * Creates the "Weekly Research Summary" doc inside the given folder.
 */
function createSummaryDoc(folder) {
  var doc = DocumentApp.create('Weekly Research Summary');
  var docFile = DriveApp.getFileById(doc.getId());
  folder.addFile(docFile);
  // Remove from root so it only lives in the research folder
  DriveApp.getRootFolder().removeFile(docFile);

  doc.getBody().appendParagraph('Weekly Research Summary')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  doc.getBody().appendParagraph(
    'This document is automatically updated by the weekly research workflow.'
  );
  doc.saveAndClose();

  Logger.log('Created summary doc: ' + doc.getUrl());
  return doc;
}
