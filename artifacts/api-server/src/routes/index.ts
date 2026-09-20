import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shuutRouter from "./shuut";
import moderationRouter from "./moderation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shuutRouter);
router.use(moderationRouter);

export default router;
