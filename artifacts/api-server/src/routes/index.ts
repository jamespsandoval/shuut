import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shuutRouter from "./shuut";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shuutRouter);

export default router;
