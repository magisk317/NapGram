import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import { MergedMessageViewer } from '@/components/MergedMessageViewer';
import { ChatRecordViewer } from '@/components/ChatRecordViewer';

function ViewerWrapper() {
  const { uuid } = useParams();
  if (!uuid) return <div>No UUID provided</div>;
  return <MergedMessageViewer uuid={uuid} />;
}

function QueryViewerWrapper() {
  const [params] = useSearchParams();
  const uuid = params.get('tgWebAppStartParam') || params.get('uuid') || params.get('id');
  if (!uuid) return <div className="p-4 text-red-500">Missing uuid</div>;
  return <MergedMessageViewer uuid={uuid} />;
}

function App() {
  return (
    <BrowserRouter basename="/ui">
      <Routes>
        <Route path="/chatRecord" element={<QueryViewerWrapper />} />
        <Route path="/merged/:uuid" element={<ViewerWrapper />} />
        <Route path="/records" element={<ChatRecordViewer />} />
        <Route path="/" element={<ChatRecordViewer />} />
        <Route path="*" element={<ChatRecordViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
