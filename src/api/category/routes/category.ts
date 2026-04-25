export default {
    routes: [
      {
        method: "GET",
        path: "/getPopulatedCategory/:slug",
        handler: "get-populated-category.getPopulatedCategory",
        // config: {
        //   policies: ["global::is-authenticated"],
        // },
      },
    ],
  };