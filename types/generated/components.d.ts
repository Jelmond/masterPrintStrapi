import type { Schema, Struct } from '@strapi/strapi';

export interface SalesSale extends Struct.ComponentSchema {
  collectionName: 'components_sales_sales';
  info: {
    description: '';
    displayName: 'sale';
  };
  attributes: {
    description: Schema.Attribute.RichText;
    name: Schema.Attribute.String;
    sale: Schema.Attribute.Relation<'oneToOne', 'api::sale.sale'>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'sales.sale': SalesSale;
    }
  }
}
