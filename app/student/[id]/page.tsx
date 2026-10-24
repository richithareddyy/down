import {notFound} from 'next/navigation';
import {StudentPhone} from '../../../components/StudentPhone';
import {seedMessages} from '../../../src/demo/seed';
export default async function StudentPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!Object.hasOwn(seedMessages,id))notFound();return <main className="student-shell"><a className="wordmark" href="/">down<span>?</span><i/></a><p className="student-caption">your interests. your conditions. your call.</p><StudentPhone id={id} seedText={seedMessages[id]} standalone/><p className="student-disclaimer">Logically isolated on our server. In small circles, identities may be inferred.<br/>Demo access uses a student picker; anyone with this link can act as this student.</p></main>}
