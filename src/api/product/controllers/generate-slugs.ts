/**
 * generate-slugs controller
 */

export default {
  async generateSlugs(ctx) {
    try {
      // Получаем все продукты без slug или с пустым slug
      const products = await strapi.db.query('api::product.product').findMany({
        where: {
          $or: [
            { slug: null },
            { slug: '' },
          ],
        },
      });

      if (products.length === 0) {
        return ctx.send({
          message: 'Все продукты уже имеют slug',
          updated: 0,
        });
      }

      // Функция для транслитерации и создания slug
      const generateSlug = (title) => {
        if (!title) {
          return 'product';
        }

        // Базовая транслитерация русских символов
        const transliterationMap = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
          'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
          'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
          'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
          'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
          'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
          'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
          'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
          'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
          'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
        };

        let slug = title
          .split('')
          .map(char => transliterationMap[char] || char)
          .join('')
          .toLowerCase()
          // Заменяем пробелы и специальные символы на дефисы
          .replace(/[^a-z0-9]+/g, '-')
          // Удаляем дефисы в начале и конце
          .replace(/^-+|-+$/g, '')
          // Удаляем множественные дефисы
          .replace(/-+/g, '-');

        // Если slug пустой, используем дефолтное значение
        if (!slug) {
          slug = 'product';
        }

        return slug;
      };

      // Генерируем и обновляем slug для каждого продукта
      let updated = 0;
      for (const product of products) {
        const slug = generateSlug(product.title);
        
        // Проверяем уникальность slug
        let finalSlug = slug;
        let counter = 1;
        
        while (true) {
          const existing = await strapi.db.query('api::product.product').findOne({
            where: { slug: finalSlug },
          });
          
          if (!existing || existing.id === product.id) {
            break;
          }
          
          finalSlug = `${slug}-${counter}`;
          counter++;
        }

        await strapi.db.query('api::product.product').update({
          where: { id: product.id },
          data: { slug: finalSlug },
        });

        updated++;
      }

      return ctx.send({
        message: `Успешно сгенерировано ${updated} slug(ов)`,
        updated,
      });
    } catch (err) {
      ctx.throw(500, err);
    }
  },
};

