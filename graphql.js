require("dotenv").config();
const { ApolloServer, gql } = require("apollo-server-lambda");
const dynamoose = require("dynamoose");
const fetch = require("node-fetch");
const { v4 } = require("uuid");

const GOOGLE_TOKEN_INFO_BASE_URL =
  "https://www.googleapis.com/oauth2/v3/tokeninfo";

dynamoose.aws.sdk.config.update({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  region: "sa-east-1",
});

const DESAFIA_AI_MODEL = dynamoose.model(
  "DESAFIA_AI",
  new dynamoose.Schema(
    { PK: String, SK: { type: String, rangeKey: true } },
    {
      create: false,
      saveUnknown: true,
      updateUnknown: true,
    }
  )
);

const getChallengeImage = (category) => {
  switch (category) {
    case "Internet das Coisas":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/IoT.svg";

    case "Desenvolvimento Web":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/webdev-prog.svg";

    case "Lógica de Programação":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/webdev-prog.svg";

    case "Machine Learning":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/machine-learning.svg";

    case "Ciência de Dados":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/datascience.svg";

    case "Redes":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/rj45.svg";

    default:
      break;
  }
};

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  scalar JSON

  input UserInput {
    googleId: String!
    email: String!
    name: String
    interactions: Int
  }

  input SolutionInput {
    id: String
    challengeId: String!
    title: String!
    description: JSON!
    userGoogleId: String!
  }

  input LikeSolutionInput {
    solutionId: String!
    challengeId: String!
    currentUserId: String
    currentUserEmail: String
    interactions: Int
    likes: Int
  }

  input AcceptChallengeInput {
    challengeId: String!
    currentUserId: String!
  }

  input DeleteInteractionInput {
    solutionId: String
    commentId: String
    challengeId: String
  }

  input DislikeSolutionInput {
    solutionId: String!
    challengeId: String!
    currentUserId: String
    likes: Int
  }

  input CommentSolutionInput {
    solutionId: String!
    challengeId: String!
    currentUserId: String
    interactions: Int
    currentUserEmail: String
    message: String!
  }

  input ChallengeInput {
    id: String
    userGoogleId: String!
    name: String
    description: String
    tags: [JSON]
    categories: [JSON]
    details: String
  }

  type Solution {
    id: String
    challengeId: String
    title: String
    description: JSON
    likes: JSON
    userGoogleId: String
    likedByCurrentUser: Boolean
  }

  type SolutionsResponse {
    hasMore: Boolean
    list: [Solution]
  }

  type ChallengesResponse {
    count: Int
    list: [Challenge]
  }

  type Challenge {
    id: String
    name: String
    description: String
    tags: [JSON]
    categories: [JSON]
    imageUrl: String
    the_one: Boolean
    userGoogleId: String
    details: String
    acceptedByCurrentUser: Boolean
  }

  type User {
    googleId: String!
    email: String!
    name: String
    interactions: Int
  }

  type Comment {
    id: String
    challengeId: String!
    userGoogleId: String
    userEmail: String
    message: String!
  }

  type CommentsResponse {
    hasMore: Boolean
    list: [Comment]
  }

  type Query {
    theOne: Challenge
    hello: String
    ranking: [User]
    challenges(
      search: String
      tags: [String]
      categories: [String]
      page: Int
    ): ChallengesResponse
    solutionComments(solutionId: String!, limit: Int!): CommentsResponse
    challenge(id: String!, currentUserId: String): Challenge
    solutions(
      challengeId: String
      currentUserId: ID!
      limit: Int!
    ): SolutionsResponse
    currentUser: User
  }

  type Mutation {
    user(input: UserInput): User
    challenge(input: ChallengeInput): String
    solution(input: SolutionInput): Int
    likeSolution(input: LikeSolutionInput): Int
    acceptChallenge(input: AcceptChallengeInput): Int
    unacceptChallenge(input: AcceptChallengeInput): Int
    dislikeSolution(input: DislikeSolutionInput): Int
    deleteInteraction(input: DeleteInteractionInput): Int
    commentSolution(input: CommentSolutionInput): Int
  }
`;

// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    currentUser: async (_, __, context) => {
      const response = await fetch(
        `${GOOGLE_TOKEN_INFO_BASE_URL}?id_token=${context.headers.Authorization}`
      );

      const responseJSON = await response.json();

      if (response.status === 200) {
        const currentUser = await DESAFIA_AI_MODEL.scan({
          PK: { eq: `USER#${responseJSON.sub}` },
        }).exec();

        return {
          googleId: responseJSON.sub,
          name: currentUser[0].name,
          email: responseJSON.email,
          interactions: currentUser[0].interactions,
        };
      } else {
        throw new Error("Unathorized: 403");
      }
    },
    solutions: async (_, { challengeId, currentUserId, limit }) => {
      const scanParams = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "SOLUTION#" },
        SK: { eq: `CHALLENGE#${challengeId}` },
      });

      let solutions = await scanParams.exec();
      const operationInfo = await scanParams.count().exec();

      solutions = solutions
        .sort((a, b) => b.likes - a.likes)
        .slice(Math.max(solutions.length - limit, 0))
        .map((solution) => {
          return {
            challengeId: challengeId,
            id: solution.id,
            title: solution.title,
            description: solution.description,
            likes: solution.likes,
            likedByCurrentUser:
              solution.likes?.users?.[currentUserId] >= 1 ? true : false,
            userGoogleId: solution.userGoogleId,
          };
        });

      return {
        hasMore: operationInfo.count > limit,
        list: solutions,
      };
    },
    theOne: async () => {
      const theOne = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "CHALLENGE#" },
        the_one: { eq: true },
      }).exec();

      return {
        name: theOne[0].name,
        description: theOne[0].description,
        imageUrl: theOne[0].imageUrl,
      };
    },
    hello: async () => {
      return "Hello world!";
    },
    ranking: async () => {
      const users = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "USER#" },
      }).exec();

      return users
        .sort((a, b) => a.interactions - b.interactions)
        .map((user, index) => {
          return {
            name: `${index + 1}. ${user.name}`,
            interactions: user.interactions,
          };
        });
    },
    challenges: async (_, { search, categories, tags, page }) => {
      let scanParams = DESAFIA_AI_MODEL.scan("PK").contains("CHALLENGE#");

      if (search) {
        scanParams = scanParams.and().where("name").contains(search);
      }

      if (categories) {
        categories.map((category) => {
          scanParams = scanParams.and().where("categories").contains(category);
        });
      }

      if (tags) {
        tags.map((tag) => {
          scanParams = scanParams.and().where("tags").contains(tag);
        });
      }

      let challenges = await scanParams.exec();
      const operationInfo = await scanParams.count().exec();
      const srcPage = page * 5;

      challenges = challenges.slice(srcPage, srcPage + 5);

      return {
        count: operationInfo.count,
        list: challenges.map((challenge) => {
          return {
            id: challenge.id,
            name: challenge.name,
            description: challenge.description,
            imageUrl: challenge.imageUrl,
            categories: challenge.categories,
            tags: challenge.tags,
          };
        }),
      };
    },
    challenge: async (_, { id, currentUserId }) => {
      const challenge = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "CHALLENGE#" },
        id: { eq: id },
      }).exec();

      const acceptedByCurrentUser = await DESAFIA_AI_MODEL.scan({
        PK: { eq: `USER#${currentUserId}` },
        SK: { eq: `CHALLENGE#${id}` },
      })
        .count()
        .exec();

      return {
        id: challenge[0].id,
        details: challenge[0].details,
        name: challenge[0].name,
        description: challenge[0].description,
        userGoogleId: challenge[0].SK.split("#")[1],
        imageUrl: challenge[0].imageUrl,
        categories: challenge[0].categories,
        tags: challenge[0].tags,
        acceptedByCurrentUser: acceptedByCurrentUser.count >= 1,
      };
    },
    solutionComments: async (_, { solutionId, limit }, __) => {
      let scanParams = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "COMMENT#" },
        SK: { eq: `SOLUTION#${solutionId}` },
      });

      let comments = await scanParams.exec();
      const operationInfo = await scanParams.count().exec();

      comments = comments
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(Math.max(comments.length - limit, 0))
        .map((comment) => {
          return {
            id: comment.id,
            challengeId: comment.challengeId,
            message: comment.message,
            userGoogleId: comment.userGoogleId,
            userEmail: comment.userEmail,
          };
        });

      return {
        hasMore: operationInfo.count > limit,
        list: comments ?? [],
      };
    },
  },
  Mutation: {
    user: async (_, { input }, context) => {
      const user = new DESAFIA_AI_MODEL({
        PK: `USER#${input.googleId}`,
        SK: `USER#${input.email}`,
        ...(input.name && { name: input.name }),
        ...(input.interactions && { interactions: input.interactions }),
      });

      try {
        user.save();
      } catch {
        throw new Error("Unathorized: 403");
      }

      const response = await fetch(
        `${GOOGLE_TOKEN_INFO_BASE_URL}?id_token=${context.headers.Authorization}`
      );

      const responseJSON = await response.json();

      if (response.status === 200) {
        const currentUser = await DESAFIA_AI_MODEL.scan({
          PK: { eq: `USER#${responseJSON.sub}` },
        }).exec();

        return {
          googleId: responseJSON.sub,
          name: currentUser[0].name,
          interactions: currentUser[0].interactions,
          email: responseJSON.email,
        };
      } else {
        throw new Error("Unathorized: 403");
      }
    },
    acceptChallenge: async (_, { input }, __) => {
      const challengeAccepted = new DESAFIA_AI_MODEL({
        PK: `USER#${input.currentUserId}`,
        SK: `CHALLENGE#${input.challengeId}`,
        date: Date.now(),
      });

      try {
        await challengeAccepted.save();

        return 200;
      } catch (e) {
        console.log(e);
        throw new Error("Generic Error", e);
      }
    },
    unacceptChallenge: async (_, { input }, __) => {
      try {
        await DESAFIA_AI_MODEL.delete({
          PK: `USER#${input.currentUserId}`,
          SK: `CHALLENGE#${input.challengeId}`,
        });

        return 200;
      } catch (e) {
        console.log(e);
        throw new Error("Generic Error", e);
      }
    },
    likeSolution: async (_, { input }, __) => {
      try {
        await DESAFIA_AI_MODEL.update(
          {
            PK: `SOLUTION#${input.solutionId}`,
            SK: `CHALLENGE#${input.challengeId}`,
          },
          {
            id: input.solutionId,
            ...(input.likes && {
              likes: {
                count: input.likes,
                users: { [input.currentUserId]: 1 },
              },
            }),
          }
        );

        await DESAFIA_AI_MODEL.update(
          {
            PK: `USER#${input.currentUserId}`,
            SK: `USER#${input.currentUserEmail}`,
          },
          {
            interactions: input.interactions,
          }
        );

        return 200;
      } catch (e) {
        console.log(e);
        throw new Error("Generic Error", e);
      }
    },
    dislikeSolution: async (_, { input }, __) => {
      try {
        await DESAFIA_AI_MODEL.update(
          {
            PK: `SOLUTION#${input.solutionId}`,
            SK: `CHALLENGE#${input.challengeId}`,
          },
          {
            id: input.solutionId,
            ...(input.likes >= 0 && {
              likes: {
                count: input.likes,
                users: { [input.currentUserId]: 0 },
              },
            }),
          }
        );

        return 200;
      } catch (e) {
        console.log(e);
        throw new Error("Generic Error", e);
      }
    },
    commentSolution: async (_, { input }, __) => {
      const commentId = v4();

      const comment = new DESAFIA_AI_MODEL({
        PK: `COMMENT#${commentId}`,
        SK: `SOLUTION#${input.solutionId}`,
        id: commentId,
        challengeId: input.challengeId,
        userGoogleId: input.currentUserId,
        userEmail: input.currentUserEmail,
        message: input.message,
        date: Date.now(),
      });

      try {
        await comment.save();

        await DESAFIA_AI_MODEL.update(
          {
            PK: `USER#${input.currentUserId}`,
            SK: `USER#${input.currentUserEmail}`,
          },
          {
            interactions: input.interactions,
          }
        );

        return 200;
      } catch (e) {
        console.log(e);
        throw new Error("Generic Error", e);
      }
    },
    challenge: async (_, { input }, __) => {
      const challengeId = v4();

      const challenge = new DESAFIA_AI_MODEL({
        PK: `CHALLENGE#${input.name}`,
        SK: `USER#${input.userGoogleId}`,
        id: input.id ? input.id : challengeId,
        ...(input.name && { name: input.name }),
        ...(input.description && { description: input.description }),
        ...(input.categories && { categories: input.categories }),
        ...(input.tags && { tags: input.tags }),
        ...(input.categories && {
          imageUrl: getChallengeImage(input.categories[0]),
        }),
        ...(input.details && { details: input.details }),
      });

      try {
        challenge.save();

        return challengeId;
      } catch {
        throw new Error("Generic Error", e);
      }
    },
    deleteInteraction: async (_, { input }, __) => {
      console.log(
        "🚀 ~ file: graphql.js ~ line 561 ~ deleteInteraction: ~ input",
        input
      );
      try {
        if (input.commentId) {
          await DESAFIA_AI_MODEL.delete({
            PK: `COMMENT#${input.commentId}`,
            SK: `SOLUTION#${input.solutionId}`,
          });
        } else if (challengeId) {
          await DESAFIA_AI_MODEL.delete({
            PK: `SOLUTION#${input.solutionId}`,
            SK: `CHALLENGE#${input.challengeId}`,
          });
        }
        return 200;
      } catch (e) {
        console.log(e);
        throw new Error("Generic Error", e);
      }
    },
    solution: async (_, { input }, __) => {
      const solutionId = v4();

      const solution = new DESAFIA_AI_MODEL({
        PK: `SOLUTION#${input.id ? input.id : solutionId}`,
        SK: `CHALLENGE#${input.challengeId}`,
        id: input.id ? input.id : solutionId,
        ...(input.title && { title: input.title }),
        ...(input.description && { description: input.description }),
        ...(input.likes && { likes: input.likes }),
        ...(input.userGoogleId && { userGoogleId: input.userGoogleId }),
      });

      try {
        solution.save();

        return 200;
      } catch {
        throw new Error("Generic Error", e);
      }
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  playground: {
    endpoint: "/dev/graphql",
  },
  context: ({ event, context }) => ({
    headers: event.headers,
    functionName: context.functionName,
    event,
    context,
  }),
});

exports.graphqlHandler = server.createHandler({
  cors: {
    origin: "*",
    credentials: true,
  },
});
