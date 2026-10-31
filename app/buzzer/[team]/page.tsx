import QuizApp from "@/components/quiz-app";
export default async function Page({params}:{params:Promise<{team:string}>}){const {team}=await params;return <QuizApp page="buzzer" teamId={team.toUpperCase()}/>;}
