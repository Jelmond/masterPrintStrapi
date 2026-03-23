'use strict';

/**
 * В morph-таблице связей upload.files ↔ сущности колонка `field` = имя атрибута продукта (`images` | `preview`).
 * Меняем местами привязки для api::product.product, чтобы данные соответствовали схеме:
 * - preview = одна картинка (то, что раньше лежало в images)
 * - images = несколько (то, что раньше лежало в preview)
 *
 * Схему product.json менять не требуется.
 */

const PRODUCT_UID = 'api::product.product';
const TMP = '__strapi_swap_images_preview__';

/** Strapi 5 сокращает длинные имена: morphs → mph, таблица часто `files_related_mph`. */
const MORPH_TABLE_CANDIDATES = ['files_related_morphs', 'files_related_mph'];

function isLikelyUploadMorphTableName(name) {
  if (!name || !/related/i.test(name)) return false;
  return /morph/i.test(name) || /_mph$/i.test(name) || /related_mph/i.test(name);
}

function pickSqliteTableNames(rawResult) {
  const rows = rawResult?.rows ?? (Array.isArray(rawResult?.[0]) ? rawResult[0] : rawResult);
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => r.name).filter(Boolean);
}

async function resolveMorphTable(trx) {
  for (const candidate of MORPH_TABLE_CANDIDATES) {
    if (await trx.schema.hasTable(candidate)) {
      return candidate;
    }
  }

  const client = trx.client?.config?.client;

  if (client === 'sqlite3' || client === 'better-sqlite3') {
    const raw = await trx.raw(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%related%' AND (name LIKE '%morph%' OR name LIKE '%_mph')`
    );
    for (const name of pickSqliteTableNames(raw)) {
      if (
        (await trx.schema.hasTable(name)) &&
        (await trx.schema.hasColumn(name, 'field')) &&
        ((await trx.schema.hasColumn(name, 'related_type')) ||
          (await trx.schema.hasColumn(name, 'relatedType')))
      ) {
        return name;
      }
    }
  }

  if (client === 'mysql' || client === 'mysql2') {
    const res = await trx.raw(`
      SELECT t1.TABLE_NAME AS name
      FROM information_schema.COLUMNS t1
      INNER JOIN information_schema.COLUMNS t2
        ON t1.TABLE_SCHEMA = t2.TABLE_SCHEMA AND t1.TABLE_NAME = t2.TABLE_NAME
      WHERE t1.TABLE_SCHEMA = DATABASE()
        AND t1.COLUMN_NAME = 'field'
        AND t2.COLUMN_NAME = 'related_type'
    `);
    const rows = res?.[0] || res?.rows || res;
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find((r) => isLikelyUploadMorphTableName(r.name));
    if (hit) return hit.name;
  }

  if (client === 'pg' || client === 'postgres' || client === 'postgresql') {
    const schema =
      (Array.isArray(trx.client?.config?.searchPath) && trx.client.config.searchPath[0]) || 'public';
    const res = await trx.raw(
      `SELECT c.table_name AS name
       FROM information_schema.columns c
       WHERE c.table_schema = ?
         AND c.column_name = 'field'
         AND EXISTS (
           SELECT 1 FROM information_schema.columns c2
           WHERE c2.table_schema = c.table_schema
             AND c2.table_name = c.table_name
             AND c2.column_name = 'related_type'
         )`,
      [schema]
    );
    const rows = res?.rows || res;
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find((r) => isLikelyUploadMorphTableName(r.name));
    if (hit) return hit.name;
  }

  return null;
}

async function up(trx) {
  const table = await resolveMorphTable(trx);
  if (!table) {
    console.warn(
      '[migration swap-product-images-preview] Morph-таблица не найдена — пропуск (часто так на пустой БД до первой загрузки схемы).'
    );
    return;
  }

  const hasField = await trx.schema.hasColumn(table, 'field');
  let typeCol = null;
  if (await trx.schema.hasColumn(table, 'related_type')) typeCol = 'related_type';
  else if (await trx.schema.hasColumn(table, 'relatedType')) typeCol = 'relatedType';

  if (!hasField || !typeCol) {
    console.warn(
      `[migration swap-product-images-preview] У таблицы ${table} нет колонок field / related_type — пропуск.`
    );
    return;
  }

  await trx(table).where(typeCol, PRODUCT_UID).where('field', 'images').update({ field: TMP });

  await trx(table).where(typeCol, PRODUCT_UID).where('field', 'preview').update({ field: 'images' });

  await trx(table).where(typeCol, PRODUCT_UID).where('field', TMP).update({ field: 'preview' });
}

async function down() {
  throw new Error(
    'Откат: восстановите бэкап БД или выполните обратный swap вручную (миграция помечена выполненной в strapi_migrations).'
  );
}

module.exports = { up, down };
