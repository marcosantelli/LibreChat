// client/src/components/Chat/Tools/LibreGo/Terminal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { chatModelConfigState } from '~/state/modelConfiguration';

function Terminal() {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const outputRef = useRef(null);
  const modelConfig = useRecoilValue(chatModelConfigState);
  
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);
  
  const executeCommand = async (e) => {
    e.preventDefault();
    if (!command.trim() || isExecuting) return;
    
    setIsExecuting(true);
    setOutput(prev => [...prev, { type: 'command', text: command }]);
    
    try {
      // This would be replaced with actual logic to execute the command via the tool
      // For now, we'll simulate a command execution
      // In real implementation, this would use the appropriate hooks to call the tool

      setTimeout(() => {
        setOutput(prev => [...prev, { 
          type: 'response', 
          text: `Simulated output for: ${command}` 
        }]);
        setIsExecuting(false);
        setCommand('');
      }, 1000);
      
    } catch (error) {
      setOutput(prev => [...prev, { type: 'error', text: error.message }]);
      setIsExecuting(false);
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-black text-green-500 rounded-md overflow-hidden font-mono text-sm">
      <div className="bg-gray-800 text-white p-2 font-bold border-b border-gray-700">
        AI-Concert Terminal
      </div>
      
      <div 
        ref={outputRef} 
        className="flex-1 p-2 overflow-y-auto"
      >
        {output.map((item, i) => (
          <div 
            key={i} 
            className={`mb-1 ${item.type === 'error' ? 'text-red-500' : ''}`}
          >
            {item.type === 'command' ? (
              <div>
                <span className="text-blue-500">$ </span>
                {item.text}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{item.text}</div>
            )}
          </div>
        ))}
      </div>
      
      <form onSubmit={executeCommand} className="p-2 border-t border-gray-700 flex">
        <span className="text-blue-500 mr-1">$</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none"
          placeholder="Enter command..."
          disabled={isExecuting}
        />
      </form>
    </div>
  );
}

export default Terminal;