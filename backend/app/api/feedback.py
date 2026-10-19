from fastapi import APIRouter
from sqlalchemy.dialects.postgresql import insert

from app.deps import SessionDep, UserDep
from app.errors import not_found
from app.models import Feedback, QueryRun
from app.schemas.feedback import FeedbackIn, FeedbackOut

router = APIRouter(tags=["feedback"])


@router.post("/feedback")
async def give_feedback(body: FeedbackIn, user: UserDep, session: SessionDep) -> FeedbackOut:
    run = await session.get(QueryRun, body.run_id)
    if run is None or run.user_id != user.id:
        raise not_found("Run")
    stmt = insert(Feedback).values(
        run_id=run.id, user_id=user.id, rating=body.rating, comment=body.comment
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Feedback.run_id, Feedback.user_id],
            set_={"rating": stmt.excluded.rating, "comment": stmt.excluded.comment},
        )
    )
    await session.commit()
    return FeedbackOut(run_id=run.id, rating=body.rating, comment=body.comment)
