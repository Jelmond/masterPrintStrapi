export default {
    routes: [
      {
        method: "GET",
        path: "/getPopulatedCategory/:id",
        handler: "get-populated-category.getPopulatedCategory",
        // config: {
        //   policies: ["global::is-authenticated"],
        // },
      },
    ],
  };