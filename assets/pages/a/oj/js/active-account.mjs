import { openOjAccount } from './account.mjs';
import { historyEntries, saveResult } from './workspace.mjs';

export const account = openOjAccount(historyEntries, saveResult);
