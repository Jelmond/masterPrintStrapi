export default {
    routes: [
      {
        method: "GET",
        path: "/getSimilarProducts/:slug",
        handler: "get-similar-products.getSimilarProducts",
        // config: {
        //   policies: ["global::is-authenticated"],
        // },
      },
      {
        method: "GET",
        path: "/search",
        handler: "search.search",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "GET",
        path: "/bestsellers",
        handler: "bestsellers.find",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "POST",
        path: "/generate-slugs",
        handler: "generate-slugs.generateSlugs",
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
      },
    ],
  };