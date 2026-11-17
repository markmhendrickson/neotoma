import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { registerEntitySearchTextCases } from "../helpers/entity_search_text_cases.js";

registerEntitySearchTextCases("sqlite", async (file) => new AsyncSqliteDatabase(file));
